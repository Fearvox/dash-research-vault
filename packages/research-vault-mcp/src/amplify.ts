// Amplify API MCP Tools
// Vanderbilt AI Amplify platform — chat, models, file management

const AMPLIFY_BASE = 'https://prod-api.vanderbilt.ai'

export interface AmplifyConfig {
  apiKey: string
}

let config: AmplifyConfig | null = null

export function configureAmplify(apiKey: string) {
  config = { apiKey }
}

function getHeaders() {
  if (!config?.apiKey) throw new Error('Amplify API key not configured. Call configureAmplify() first.')
  return {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  }
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  inputContextWindow: number
  outputTokenLimit: number
  supportsImages: boolean
  supportsSystemPrompts: boolean
  systemPrompt?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  dataSources?: string[]
  modelId?: string
  ragOnly?: boolean
  skipRag?: boolean
}

export const amplifyTools = [
  {
    name: 'amplify_list_models',
    description: 'List available models on Vanderbilt Amplify. Returns model IDs, context windows, providers, and pricing tiers.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/available_models`, {
          headers: getHeaders()
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        }
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
      }
    }
  },

  {
    name: 'amplify_chat',
    description: 'Send a streaming chat message to Amplify. Returns Claude/GPT/Mistral responses via SSE.',
    inputSchema: {
      type: 'object',
      required: ['message'],
      properties: {
        message: { type: 'string', description: 'User message' },
        modelId: { type: 'string', description: 'Model ID (from amplify_list_models)' },
        systemPrompt: { type: 'string', description: 'Optional system prompt override' },
        temperature: { type: 'number', description: 'Temperature (0-2, default 0.7)' },
        maxTokens: { type: 'number', description: 'Max output tokens (default 4000)' },
        stream: { type: 'boolean', description: 'If true, yield chunks via onProgress callback instead of waiting for complete response (default false)' }
      }
    },
    call: async ({ message, modelId, systemPrompt, temperature = 0.7, maxTokens = 4000, stream = false }: {
      message: string, modelId?: string, systemPrompt?: string, temperature?: number, maxTokens?: number, stream?: boolean
    }, onProgress?: (data: { type: string; text?: string }) => void) => {
      try {
        const body: any = {
          data: {
            model: modelId || 'gpt-4o',
            temperature,
            max_tokens: maxTokens,
            messages: [{ role: 'user', content: message }]
          }
        }
        if (systemPrompt) {
          body.data.messages.unshift({ role: 'system', content: systemPrompt })
        }

        const res = await fetch(`${AMPLIFY_BASE}/chat`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(body)
        })

        if (!res.ok) {
          const err = await res.text()
          throw new Error(`HTTP ${res.status}: ${err}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let fullText = ''

        const processEventBlock = (block: string) => {
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue
            let parsed: any
            try { parsed = JSON.parse(line.slice(6)) } catch { continue }
            let textChunk = ''
            if (parsed?.data?.content) {
              textChunk = parsed.data.content
            } else if (parsed?.data) {
              textChunk = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data)
            }
            if (textChunk) {
              fullText += textChunk
              if (stream && onProgress) {
                onProgress({ type: 'chunk', text: textChunk })
              }
            }
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let sep: number
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const eventBlock = buffer.slice(0, sep)
            buffer = buffer.slice(sep + 2)
            processEventBlock(eventBlock)
          }
        }
        buffer += decoder.decode()
        if (buffer.length > 0) {
          processEventBlock(buffer)
          buffer = ''
        }

        return {
          content: [{ type: 'text', text: fullText || '(no response)' }]
        }
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
      }
    }
  },

  {
    name: 'amplify_files_query',
    description: 'Query uploaded files on Amplify using semantic search. Returns relevant file chunks.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' }
      }
    },
    call: async ({ query, limit = 5 }: { query: string, limit?: number }) => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/files/query`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ query, limit })
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
        }
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
      }
    }
  },

  {
    name: 'amplify_files_list',
    description: 'List tags/categories of uploaded files on Amplify.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/files/tags/list`, {
          headers: getHeaders()
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
        }
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
      }
    }
  },

  {
    name: 'amplify_assistants_list',
    description: 'List your Amplify assistants.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/assistant/list`, {
          headers: getHeaders()
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
        }
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
      }
    }
  }
]
