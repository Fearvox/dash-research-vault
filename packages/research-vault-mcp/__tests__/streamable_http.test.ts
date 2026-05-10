import { afterEach, describe, expect, test } from 'bun:test'
import { createServer } from 'net'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = join(__dirname, '..')

const children: Bun.Subprocess[] = []

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill()
  }
})

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolve(address.port)
        } else {
          reject(new Error('failed to allocate a test port'))
        }
      })
    })
  })
}

async function startHttpServer(port: number) {
  const child = Bun.spawn(['bun', 'run', 'src/server.ts'], {
    cwd: PKG_ROOT,
    env: {
      ...process.env,
      MCP_TRANSPORT: 'http',
      MCP_PORT: String(port),
      MCP_PROFILE: 'readonly',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  children.push(child)

  const baseUrl = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return baseUrl
    } catch {}
    await Bun.sleep(50)
  }

  throw new Error('research-vault MCP HTTP server did not become healthy')
}

async function postMcp(baseUrl: string, body: unknown, headers: Record<string, string> = {}) {
  return await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('Streamable HTTP /mcp transport', () => {
  async function initialize(baseUrl: string) {
    const response = await postMcp(baseUrl, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'rv-mcp-test', version: '1.0.0' },
      },
    })

    expect(response.status).toBe(200)
    const sessionId = response.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()

    return { response, sessionId: sessionId! }
  }

  test('handles initialize and readonly tools/list JSON-RPC requests', async () => {
    const port = await getFreePort()
    const baseUrl = await startHttpServer(port)

    const healthResponse = await fetch(`${baseUrl}/health`)
    const health = await healthResponse.json()
    expect(health.profile).toBe('readonly')
    expect(health.public_safe_default).toBe(true)
    expect(health.total_registered_tools).toBeGreaterThan(health.tools)
    expect(health.visible_tools).toContain('vault_search')
    expect(health.visible_tools).not.toContain('vault_delete')

    const { response: initResponse, sessionId } = await initialize(baseUrl)

    expect(initResponse.status).toBe(200)
    expect(initResponse.headers.get('content-type')).toContain('application/json')

    const initJson = await initResponse.json()
    expect(initJson.result.protocolVersion).toBe('2025-03-26')
    expect(initJson.result.serverInfo.name).toBe('research-vault-mcp')

    const initializedResponse = await postMcp(
      baseUrl,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': '2025-03-26',
      },
    )
    expect(initializedResponse.status).toBe(202)

    const listResponse = await postMcp(
      baseUrl,
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': '2025-03-26',
      },
    )

    expect(listResponse.status).toBe(200)
    const listJson = await listResponse.json()
    const toolNames = listJson.result.tools.map((tool: { name: string }) => tool.name)
    expect(toolNames).toContain('vault_status')
    expect(toolNames).toContain('vault_search')
    expect(toolNames).toContain('vault_get')
    expect(toolNames).not.toContain('vault_delete')
    expect(toolNames).not.toContain('vault_raw_ingest')
  })

  test('blocks direct readonly calls to mutation tools with guidance', async () => {
    const port = await getFreePort()
    const baseUrl = await startHttpServer(port)
    const { sessionId } = await initialize(baseUrl)

    const callResponse = await postMcp(
      baseUrl,
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'vault_delete',
          arguments: { id: 'do-not-delete' },
        },
      },
      {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': '2025-03-26',
      },
    )

    expect(callResponse.status).toBe(200)
    const callJson = await callResponse.json()
    expect(callJson.result.isError).toBe(true)
    const text = callJson.result.content[0].text
    const envelope = JSON.parse(text)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.agent_guidance.recommended_tool).toBe('vault_search')
    expect(envelope.agent_guidance.next_step).toContain('vault_search')
  })
})
