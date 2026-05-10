import { afterEach, describe, expect, test } from 'bun:test'
import { amplifyTools } from '../src/amplify.ts'
import { httpHandler, loadAmplifyFromEnv } from '../src/server.ts'

const originalFetch = globalThis.fetch
const originalConfigureSecret = process.env.MCP_CONFIGURE_SECRET
const originalAmplifyApiKey = process.env.AMPLIFY_API_KEY
const originalMcpProfile = process.env.MCP_PROFILE

function restoreEnvVar(name: 'MCP_CONFIGURE_SECRET' | 'AMPLIFY_API_KEY' | 'MCP_PROFILE', value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

function makeConfigureRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request('http://localhost/configure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  restoreEnvVar('MCP_CONFIGURE_SECRET', originalConfigureSecret)
  restoreEnvVar('AMPLIFY_API_KEY', originalAmplifyApiKey)
  restoreEnvVar('MCP_PROFILE', originalMcpProfile)
  globalThis.fetch = originalFetch
})

describe('/configure auth', () => {
  test('returns 403 in readonly profile without secret env', async () => {
    delete process.env.MCP_CONFIGURE_SECRET
    process.env.MCP_PROFILE = 'readonly'

    const response = await httpHandler(makeConfigureRequest({ apiKey: 'sk-test' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.agent_guidance.verdict).toBe('BLOCK')
    expect(body.agent_guidance.next_step).toContain('MCP_PROFILE=full')
  })

  test('back-compat: configures without secret env', async () => {
    delete process.env.MCP_CONFIGURE_SECRET
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest({ apiKey: 'sk-test' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'configured' })
  })

  test('back-compat: missing apiKey returns 400 without secret env', async () => {
    delete process.env.MCP_CONFIGURE_SECRET
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
  })

  test('returns 403 when secret env is set and header is missing', async () => {
    process.env.MCP_CONFIGURE_SECRET = 'topsecret'
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest({ apiKey: 'sk-test' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  test('returns 403 when secret env is set and header is wrong', async () => {
    process.env.MCP_CONFIGURE_SECRET = 'topsecret'
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest(
      { apiKey: 'sk-test' },
      { 'X-Configure-Secret': 'wrongsecret' },
    ))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })

  test('returns 200 when secret env is set and header is correct', async () => {
    process.env.MCP_CONFIGURE_SECRET = 'topsecret'
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest(
      { apiKey: 'sk-test' },
      { 'X-Configure-Secret': 'topsecret' },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'configured' })
  })

  test('returns 400 when secret env is set, header is correct, and apiKey is missing', async () => {
    process.env.MCP_CONFIGURE_SECRET = 'topsecret'
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest(
      {},
      { 'X-Configure-Secret': 'topsecret' },
    ))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeDefined()
  })

  test('accepts lowercase x-configure-secret header', async () => {
    process.env.MCP_CONFIGURE_SECRET = 'topsecret'
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest(
      { apiKey: 'sk-test' },
      { 'x-configure-secret': 'topsecret' },
    ))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'configured' })
  })

  test('returns 403 without throwing on length-mismatched secrets', async () => {
    process.env.MCP_CONFIGURE_SECRET = 'short'
    process.env.MCP_PROFILE = 'full'

    const response = await httpHandler(makeConfigureRequest(
      { apiKey: 'sk-test' },
      { 'X-Configure-Secret': 'muchlongerguess' },
    ))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Forbidden' })
  })
})

describe('AMPLIFY_API_KEY env auto-config', () => {
  test('loadAmplifyFromEnv configures amplify tools from env', async () => {
    process.env.AMPLIFY_API_KEY = 'env-test-key'

    const loaded = loadAmplifyFromEnv()
    const listModels = amplifyTools.find(tool => tool.name === 'amplify_list_models')

    expect(loaded).toBe(true)
    expect(listModels).toBeDefined()

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer env-test-key',
        'Content-Type': 'application/json',
      })
      return new Response(JSON.stringify([{ id: 'test-model' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch

    const result = await listModels!.call({})

    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('test-model')
  })

  test('loadAmplifyFromEnv returns false when env var is absent', () => {
    delete process.env.AMPLIFY_API_KEY

    expect(loadAmplifyFromEnv()).toBe(false)
  })
})
