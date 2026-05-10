// Research Vault MCP Server — stdio by default, HTTP when explicitly requested
// MCP stdio: JSON-RPC 2.0 over stdin/stdout for command-launched MCP clients.
// MCP SSE: JSON-RPC 2.0 over SSE (server→client) + HTTP POST (client→server).
// MCP Streamable HTTP: JSON-RPC 2.0 over POST /mcp for remote MCP clients.
//
// Legacy SSE flow:
//   1. Client connects GET /sse
//   2. Server sends: event: endpoint\ndata: /messages?sessionId=<uuid>
//   3. Client POSTs JSON-RPC to /messages?sessionId=<uuid>
//   4. Server sends JSON-RPC response via SSE: event: message\ndata: {...}
//
// Streamable HTTP flow:
//   1. Client POSTs initialize to /mcp
//   2. Server returns JSON-RPC response + mcp-session-id header
//   3. Client POSTs requests/notifications to /mcp with mcp-session-id

import { vaultTools } from './vault'
import { vaultWriteTools } from './vault_write.js'
import { amplifyTools, configureAmplify } from './amplify'
import { getActiveProfile } from './profile.ts'
import { errorEnvelope } from './response.ts'
import { blockedToolResponse, configureAllowed, isToolAllowed, visibleToolsForProfile } from './tool_policy.ts'
import { createHash, timingSafeEqual } from 'crypto'

// Env-var auto-config: skip the unauthenticated POST /configure step
// when the API key is provided at startup via env.
export function loadAmplifyFromEnv(): boolean {
  if (process.env.AMPLIFY_API_KEY) {
    configureAmplify(process.env.AMPLIFY_API_KEY)
    console.error('[MCP] Loaded Amplify API key from AMPLIFY_API_KEY env var')
    return true
  }

  return false
}

loadAmplifyFromEnv()

const HOST = '0.0.0.0'
const TRANSPORT = process.env.MCP_TRANSPORT ?? 'stdio'
const PORT = parseInt(process.env.MCP_PORT ?? '8765')

const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07'
]

const DEFAULT_STREAMABLE_PROTOCOL_VERSION = '2025-03-26'

// ─── MCP Protocol Types ──────────────────────────────────────────────────────

interface MCPRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: any
}

interface MCPResponse {
  jsonrpc: '2.0'
  id?: string | number
  result?: any
  error?: { code: number; message: string; data?: any }
}

interface Tool {
  name: string
  description: string
  inputSchema: any
  call: (params: any) => Promise<{ content: Array<{type: string; text: string}>; isError?: boolean }>
}

// ─── State ───────────────────────────────────────────────────────────────────

const allTools: Tool[] = [
  ...vaultTools,
  ...vaultWriteTools,
  ...amplifyTools
]

const toolMap = new Map(allTools.map(t => [t.name, t]))

// Session management: sessionId → SSE writer
interface Session {
  send: (data: string) => void
  heartbeat: ReturnType<typeof setInterval>
}

const sessions = new Map<string, Session>()
const streamableSessions = new Set<string>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeResponse(id: string | number | undefined, result?: any, error?: any): MCPResponse {
  return { jsonrpc: '2.0', id, result, error }
}

function generateSessionId(): string {
  return crypto.randomUUID()
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest()
  const bh = createHash('sha256').update(b).digest()
  return timingSafeEqual(ah, bh)
}

function negotiateProtocolVersion(requested: unknown): string {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested
  }
  return DEFAULT_STREAMABLE_PROTOCOL_VERSION
}

function mcpResponseHeaders(sessionId?: string): Headers {
  const headers = new Headers()
  if (sessionId) headers.set('mcp-session-id', sessionId)
  return headers
}

function makeMcpJsonError(status: number, code: number, message: string, sessionId?: string): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code, message },
      id: null
    },
    {
      status,
      headers: mcpResponseHeaders(sessionId)
    }
  )
}

// ─── MCP Handlers ─────────────────────────────────────────────────────────────

async function handleRequest(req: MCPRequest): Promise<MCPResponse | null> {
  const { method, id, params } = req

  // ── notifications (no id = no response expected)
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null
  }

  // ── initialize
  if (method === 'initialize') {
    return makeResponse(id, {
      protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: 'research-vault-mcp',
        version: '1.0.0'
      }
    })
  }

  // ── tools/list
  if (method === 'tools/list') {
    const visibleTools = visibleToolsForProfile(allTools, getActiveProfile())
    return makeResponse(id, {
      tools: visibleTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    })
  }

  // ── tools/call
  if (method === 'tools/call') {
    const { name, arguments: args } = params
    console.error('[DEBUG] tools/call:', name, JSON.stringify(args))
    if (!isToolAllowed(name, getActiveProfile())) {
      return makeResponse(id, blockedToolResponse(name, getActiveProfile()))
    }
    const tool = toolMap.get(name)
    if (!tool) {
      return makeResponse(id, undefined, { code: -32602, message: `Unknown tool: ${name}` })
    }
    try {
      const result = await tool.call(args || {})
      return makeResponse(id, { content: result.content, isError: result.isError })
    } catch (e: any) {
      return makeResponse(id, undefined, { code: -32603, message: `Tool error: ${e.message}` })
    }
  }

  // ── ping
  if (method === 'ping') {
    return makeResponse(id, {})
  }

  return makeResponse(id, undefined, { code: -32601, message: `Method not found: ${method}` })
}

// ─── STDIO Transport ──────────────────────────────────────────────────────────
async function handleStdioTransport() {
  const rl = await import('readline')
  const rli = rl.createInterface({ input: process.stdin as any, crlfDelay: Infinity })
  const writer = Bun.stdout.writer()

  const send = (obj: MCPResponse) => {
    writer.write(JSON.stringify(obj) + '\n')
    writer.flush()
  }

  for await (const line of rli) {
    if (!line.trim()) continue
    try {
      const req = JSON.parse(line) as MCPRequest
      const result = await handleRequest(req)
      if (result) send(result)
    } catch (e: unknown) {
      send({ jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` } })
    }
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

let server: ReturnType<typeof Bun.serve> | undefined

export async function httpHandler(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // ── POST /mcp — MCP Streamable HTTP Transport: receive JSON-RPC, respond directly
  if (url.pathname === '/mcp' && req.method === 'POST') {
    let body: MCPRequest | MCPRequest[]

    try {
      body = await req.json() as MCPRequest | MCPRequest[]
    } catch (e: any) {
      return makeMcpJsonError(400, -32700, `Parse error: ${e.message}`)
    }

    const messages = Array.isArray(body) ? body : [body]
    if (messages.length === 0) {
      return makeMcpJsonError(400, -32600, 'Invalid Request: empty batch')
    }

    const hasInitialize = messages.some(message => message?.method === 'initialize')
    let sessionId = req.headers.get('mcp-session-id') ?? undefined

    if (hasInitialize) {
      if (messages.length > 1) {
        return makeMcpJsonError(400, -32600, 'Invalid Request: initialize must be sent alone')
      }
      sessionId = generateSessionId()
      streamableSessions.add(sessionId)
    } else {
      if (!sessionId) {
        return makeMcpJsonError(400, -32000, 'Bad Request: Mcp-Session-Id header is required')
      }
      if (!streamableSessions.has(sessionId)) {
        return makeMcpJsonError(404, -32001, 'Session not found', sessionId)
      }
    }

    const responses: MCPResponse[] = []

    for (const message of messages) {
      const result = await handleRequest(message)
      if (result) responses.push(result)
    }

    if (responses.length === 0) {
      return new Response(null, {
        status: 202,
        headers: mcpResponseHeaders(sessionId)
      })
    }

    return Response.json(
      Array.isArray(body) ? responses : responses[0],
      {
        status: 200,
        headers: mcpResponseHeaders(sessionId)
      }
    )
  }

  // ── GET /mcp — optional Streamable HTTP SSE stream, not needed for JSON response mode
  if (url.pathname === '/mcp' && req.method === 'GET') {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method Not Allowed: /mcp supports POST JSON responses' },
        id: null
      },
      {
        status: 405,
        headers: {
          Allow: 'POST, DELETE'
        }
      }
    )
  }

  // ── DELETE /mcp — terminate a Streamable HTTP session
  if (url.pathname === '/mcp' && req.method === 'DELETE') {
    const sessionId = req.headers.get('mcp-session-id') ?? undefined
    if (!sessionId) {
      return makeMcpJsonError(400, -32000, 'Bad Request: Mcp-Session-Id header is required')
    }
    if (!streamableSessions.has(sessionId)) {
      return makeMcpJsonError(404, -32001, 'Session not found', sessionId)
    }
    streamableSessions.delete(sessionId)
    return new Response(null, { status: 204 })
  }

  // ── GET /sse — MCP SSE Transport: establish SSE stream + send endpoint
  if (url.pathname === '/sse' && req.method === 'GET') {
    const sessionId = generateSessionId()

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        const send = (data: string) => {
          try { controller.enqueue(encoder.encode(data)) } catch {}
        }

        // Step 1: Send the endpoint event (MCP SSE spec requirement)
        send(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`)

        // Heartbeat every 15s
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat\n\n`))
          } catch {
            clearInterval(heartbeat)
            sessions.delete(sessionId)
          }
        }, 15000)

        // Register session
        sessions.set(sessionId, { send, heartbeat })

        console.error(`[SSE] Session ${sessionId} connected`)

        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeat)
          sessions.delete(sessionId)
          console.error(`[SSE] Session ${sessionId} disconnected`)
        })
      }
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    })
  }

  // ── POST /messages?sessionId=xxx — MCP SSE Transport: receive JSON-RPC, respond via SSE
  if (url.pathname === '/messages' && req.method === 'POST') {
    const sessionId = url.searchParams.get('sessionId')

    if (!sessionId || !sessions.has(sessionId)) {
      return Response.json(
        { error: 'Invalid or missing sessionId' },
        { status: 400 }
      )
    }

    const session = sessions.get(sessionId)!

    try {
      const body = await req.json() as MCPRequest

      const result = await handleRequest(body)

      // Send response via SSE stream (MCP SSE spec)
      if (result) {
        session.send(`event: message\ndata: ${JSON.stringify(result)}\n\n`)
      }

      // Return 202 Accepted (MCP SSE spec: POST returns 202, response goes via SSE)
      return new Response(null, { status: 202 })
    } catch (e: any) {
      return Response.json(
        { jsonrpc: '2.0', error: { code: -32700, message: `Parse error: ${e.message}` } },
        { status: 400 }
      )
    }
  }

  // ── GET /health
  if (url.pathname === '/health' && req.method === 'GET') {
    const profile = getActiveProfile()
    const visibleTools = visibleToolsForProfile(allTools, profile)
    return Response.json({
      status: 'ok',
      profile,
      public_safe_default: true,
      tools: visibleTools.length,
      total_registered_tools: allTools.length,
      visible_tools: visibleTools.map(tool => tool.name),
      vault_tools: vaultTools.length,
      amplify_tools: amplifyTools.length,
      sse_sessions: sessions.size,
      streamable_sessions: streamableSessions.size,
      uptime: process.uptime()
    })
  }

  // ── POST /configure — set Amplify API key
  if (url.pathname === '/configure' && req.method === 'POST') {
    const profile = getActiveProfile()
    if (!configureAllowed(profile)) {
      return Response.json(
        errorEnvelope(
          `/configure is unavailable while Research Vault MCP is running in ${profile} profile.`,
          'Set MCP_PROFILE=full or MCP_PROFILE=admin in a private operator session before configuring mutation-capable tools.',
          { profile },
        ),
        { status: 403 },
      )
    }

    const requiredSecret = process.env.MCP_CONFIGURE_SECRET
    if (requiredSecret) {
      const providedSecret = req.headers.get('x-configure-secret') ?? ''
      if (!timingSafeStringEqual(providedSecret, requiredSecret)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    try {
      const { apiKey } = await req.json() as { apiKey: string }
      if (!apiKey) throw new Error('apiKey required')
      configureAmplify(apiKey)
      return Response.json({ status: 'configured' })
    } catch (e: any) {
      return Response.json({ error: e.message }, { status: 400 })
    }
  }

  // ── 404
  return Response.json({ error: 'Not found' }, { status: 404 })
}

function startHttpServer() {
  server = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: httpHandler
  })
}

// ─── Startup ─────────────────────────────────────────────────────────────────

if (import.meta.main) {
  if (TRANSPORT === 'stdio') {
    console.error('[MCP] Running in stdio mode (stdin/stdout JSON-RPC)')
    await handleStdioTransport()
    process.exit(0)
  } else {
    if (!process.env.MCP_CONFIGURE_SECRET) {
      console.error('[MCP] WARNING: /configure endpoint is unauthenticated. Set MCP_CONFIGURE_SECRET to require X-Configure-Secret header. Use AMPLIFY_API_KEY env var to skip /configure entirely.')
    }

    startHttpServer()

    console.log(`
╔══════════════════════════════════════════════════════╗
║   Research Vault MCP Server — MCP HTTP Transport    ║
╠══════════════════════════════════════════════════════╣
║  MCP:       http://${HOST}:${PORT}/mcp                ║
║  SSE:       http://${HOST}:${PORT}/sse                ║
║  Messages:  http://${HOST}:${PORT}/messages          ║
║  Health:    http://${HOST}:${PORT}/health            ║
╠══════════════════════════════════════════════════════╣
║  Tools:     ${String(allTools.length).padEnd(3)} (${vaultTools.length} vault, ${amplifyTools.length} amplify)     ║
╚══════════════════════════════════════════════════════╝
`)
  }

  // ─── Graceful Shutdown ───────────────────────────────────────────────────────

  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    for (const [id, session] of sessions) {
      clearInterval(session.heartbeat)
    }
    sessions.clear()
    streamableSessions.clear()
    server?.stop()
    process.exit(0)
  })
}
