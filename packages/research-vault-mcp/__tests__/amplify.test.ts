import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { amplifyTools, configureAmplify } from '../src/amplify.ts'

const originalFetch = globalThis.fetch
const amplifyChat = amplifyTools.find(tool => tool.name === 'amplify_chat')

function makeSseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  let i = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]))
      } else {
        controller.close()
      }
    }
  })
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

function getText(result: Awaited<ReturnType<NonNullable<typeof amplifyChat>['call']>>) {
  return result.content[0]?.text
}

beforeAll(() => {
  configureAmplify('test-key')
  expect(amplifyChat).toBeDefined()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('amplify_chat SSE handling', () => {
  test('uses a single fetch when stream:true', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return makeSseResponse(['data: {"data":{"content":"hi"}}\n\n'])
    }) as typeof fetch

    await amplifyChat!.call({ message: 'hi', stream: true }, () => {})

    expect(calls).toBe(1)
  })

  test('uses a single fetch when stream:false', async () => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls += 1
      return makeSseResponse(['data: {"data":{"content":"hi"}}\n\n'])
    }) as typeof fetch

    await amplifyChat!.call({ message: 'hi' })

    expect(calls).toBe(1)
  })

  test('returns concatenated full text in stream mode', async () => {
    const chunks = [
      'data: {"data":{"content":"Hel"}}\n\n',
      'data: {"data":{"content":"lo "}}\n\n',
      'data: {"data":{"content":"World"}}\n\n',
    ]
    const progress: string[] = []
    globalThis.fetch = (async () => makeSseResponse(chunks)) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi', stream: true }, data => {
      if (data.text) progress.push(data.text)
    })

    expect(getText(result)).toBe('Hello World')
    expect(progress).toEqual(['Hel', 'lo ', 'World'])
  })

  test('does not duplicate onProgress events for sequential chunks', async () => {
    const chunks = [
      'data: {"data":{"content":"a"}}\n\n',
      'data: {"data":{"content":"b"}}\n\n',
      'data: {"data":{"content":"c"}}\n\n',
      'data: {"data":{"content":"d"}}\n\n',
      'data: {"data":{"content":"e"}}\n\n',
    ]
    const progress: string[] = []
    globalThis.fetch = (async () => makeSseResponse(chunks)) as typeof fetch

    await amplifyChat!.call({ message: 'hi', stream: true }, data => {
      if (data.text) progress.push(data.text)
    })

    expect(progress).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(progress).toHaveLength(5)
  })

  test('parses events spanning chunk boundaries in non-stream mode', async () => {
    globalThis.fetch = (async () => makeSseResponse([
      'data: {"data":{"con',
      'tent":"Hello Wo',
      'rld"}}\n\n',
    ])) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi', stream: false })

    expect(getText(result)).toBe('Hello World')
  })

  test('parses events spanning chunk boundaries in stream mode', async () => {
    const progress: string[] = []
    globalThis.fetch = (async () => makeSseResponse([
      'data: {"data":{"con',
      'tent":"Hello Wo',
      'rld"}}\n\n',
    ])) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi', stream: true }, data => {
      if (data.text) progress.push(data.text)
    })

    expect(getText(result)).toBe('Hello World')
    expect(progress).toEqual(['Hello World'])
  })

  test('processes final event without trailing separator', async () => {
    globalThis.fetch = (async () => makeSseResponse([
      'data: {"data":{"content":"alpha"}}\n\ndata: {"data":{"content":"beta"}}',
    ])) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi' })

    expect(getText(result)).toBe('alphabeta')
  })

  test('returns isError for non-ok HTTP responses', async () => {
    globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi' })

    expect(result.isError).toBe(true)
    expect(getText(result)).toContain('HTTP 429')
  })

  test('returns no response marker for empty stream', async () => {
    globalThis.fetch = (async () => makeSseResponse([])) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi' })

    expect(getText(result)).toBe('(no response)')
  })

  test('falls back to stringifying non-content data fields', async () => {
    globalThis.fetch = (async () => makeSseResponse([
      'data: {"data":{"foo":"bar"}}\n\n',
    ])) as typeof fetch

    const result = await amplifyChat!.call({ message: 'hi' })

    expect(getText(result)).toContain('{"foo":"bar"}')
  })
})
