import { afterEach, beforeEach, describe, test, expect } from 'bun:test'
import { parseArxivId } from '../src/ingest/arxiv.ts'
import { _setDnsLookup, fetchHtml, validateHostDns, validateUrl } from '../src/ingest/html.ts'

describe('parseArxivId', () => {
  test('parses full URL with abs path', () => {
    expect(parseArxivId('https://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('parses abs/ URL shorthand', () => {
    expect(parseArxivId('abs/2501.00001')).toBe('2501.00001')
  })
  test('parses bare ID', () => {
    expect(parseArxivId('2501.00001')).toBe('2501.00001')
  })
  test('parses arxiv.org/abs/ URL without https', () => {
    expect(parseArxivId('http://arxiv.org/abs/2501.00001')).toBe('2501.00001')
  })
  test('returns null for non-arxiv URL', () => {
    expect(parseArxivId('https://example.com/paper')).toBeNull()
  })
  test('handles versioned IDs like 2501.00001v2', () => {
    expect(parseArxivId('2501.00001v2')).toBe('2501.00001v2')
  })
})

describe('fetchHtml SSRF redirect protection (regression)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('blocks redirect from public URL to private IP', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u.startsWith('http://example.com/')) {
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://10.0.0.1/internal' },
        })
      }
      return new Response('should not be reached', { status: 200 })
    }) as typeof fetch

    await expect(fetchHtml('http://example.com/start')).rejects.toThrow(/private/i)
  })

  test('blocks redirect chain ending in private IP', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://example.com/start') {
        return new Response(null, { status: 302, headers: { Location: 'http://example.org/middle' } })
      }
      if (u === 'http://example.org/middle') {
        return new Response(null, { status: 302, headers: { Location: 'http://192.168.1.1/lan' } })
      }
      return new Response('should not be reached')
    }) as typeof fetch

    await expect(fetchHtml('http://example.com/start')).rejects.toThrow(/private/i)
  })

  test('allows public-to-public redirect (followed and content returned)', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://example.com/start') {
        return new Response(null, { status: 302, headers: { Location: 'http://example.org/final' } })
      }
      if (u === 'http://example.org/final') {
        return new Response('<html><body>final content</body></html>', { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch

    const result = await fetchHtml('http://example.com/start')
    expect(result).toContain('final content')
  })

  test('blocks excessive redirect chain (>5 hops)', async () => {
    let hop = 0
    globalThis.fetch = (async () => {
      hop++
      return new Response(null, {
        status: 302,
        headers: { Location: `http://example${hop + 1}.com/loop` },
      })
    }) as typeof fetch

    await expect(fetchHtml('http://example1.com/loop')).rejects.toThrow(/too many redirects/i)
  }, 5000)

  test('handles relative redirect URL (resolved against current URL)', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://example.com/start') {
        return new Response(null, { status: 302, headers: { Location: '/relative-path' } })
      }
      if (u === 'http://example.com/relative-path') {
        return new Response('<html>relative target reached</html>', { status: 200 })
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch

    const result = await fetchHtml('http://example.com/start')
    expect(result).toContain('relative target reached')
  })
})

describe('validateUrl SSRF protection — IPv4 private ranges (regression)', () => {
  test('blocks 10.0.0.0/8 (regression: 4-octet was bypassed)', () => {
    expect(() => validateUrl('http://10.0.0.1/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://10.255.255.254/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://10.10.10.10/foo')).toThrow(/private/i)
  })

  test('blocks 192.168.0.0/16 (regression: 4-octet was bypassed)', () => {
    expect(() => validateUrl('http://192.168.1.1/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://192.168.0.0/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://192.168.255.255/foo')).toThrow(/private/i)
  })

  test('blocks 172.16-31.0.0/12', () => {
    expect(() => validateUrl('http://172.16.0.1/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://172.20.0.0/foo')).toThrow(/private/i)
    expect(() => validateUrl('http://172.31.255.255/foo')).toThrow(/private/i)
  })

  test('allows public 172 ranges (172.0-15 and 172.32+)', () => {
    expect(() => validateUrl('http://172.15.0.1/foo')).not.toThrow()
    expect(() => validateUrl('http://172.32.0.1/foo')).not.toThrow()
  })

  test('blocks all 127.0.0.0/8 loopback (regression: only 127.0.0.1 was blocked)', () => {
    expect(() => validateUrl('http://127.0.0.1/foo')).toThrow(/loopback/i)
    expect(() => validateUrl('http://127.0.0.2/foo')).toThrow(/loopback/i)
    expect(() => validateUrl('http://127.255.255.255/foo')).toThrow(/loopback/i)
  })

  test('blocks 0.0.0.0/8 (regression: not blocked at all)', () => {
    expect(() => validateUrl('http://0.0.0.0/foo')).toThrow(/reserved/i)
    expect(() => validateUrl('http://0.1.2.3/foo')).toThrow(/reserved/i)
  })

  test('blocks 169.254.0.0/16 link-local', () => {
    expect(() => validateUrl('http://169.254.1.1/foo')).toThrow(/link-local|metadata/i)
    expect(() => validateUrl('http://169.254.169.254/foo')).toThrow()
  })

  test('rejects invalid IPv4 addresses (octet out of range)', () => {
    expect(() => validateUrl('http://999.999.999.999/foo')).toThrow(/invalid/i)
  })
})

describe('validateUrl SSRF protection — IPv6 ranges', () => {
  test('blocks ::1 loopback', () => {
    expect(() => validateUrl('http://[::1]/foo')).toThrow(/loopback/i)
  })

  test('blocks fc00::/7 unique-local', () => {
    expect(() => validateUrl('http://[fc00::1]/foo')).toThrow(/unique-local/i)
    expect(() => validateUrl('http://[fd12:3456:789a::1]/foo')).toThrow(/unique-local/i)
  })

  test('blocks fe80::/10 link-local', () => {
    expect(() => validateUrl('http://[fe80::1]/foo')).toThrow(/link-local/i)
    expect(() => validateUrl('http://[febf::1]/foo')).toThrow(/link-local/i)
  })

  test('allows public IPv6', () => {
    expect(() => validateUrl('http://[2001:db8::1]/foo')).not.toThrow()
    expect(() => validateUrl('http://[2606:4700::1111]/foo')).not.toThrow()
  })
})

describe('validateUrl SSRF protection — hostnames and schemes', () => {
  test('blocks localhost hostname', () => {
    expect(() => validateUrl('http://localhost/foo')).toThrow(/not permitted/i)
  })

  test('blocks cloud metadata domain', () => {
    expect(() => validateUrl('http://metadata.google.internal/foo')).toThrow(/not permitted/i)
  })

  test('blocks non-http schemes', () => {
    expect(() => validateUrl('file:///etc/passwd')).toThrow(/scheme/i)
    expect(() => validateUrl('ftp://example.com/foo')).toThrow(/scheme/i)
  })

  test('rejects malformed URLs', () => {
    expect(() => validateUrl('not a url')).toThrow(/invalid/i)
  })

  test('allows public IPs and hostnames', () => {
    expect(() => validateUrl('https://example.com/foo')).not.toThrow()
    expect(() => validateUrl('https://8.8.8.8/foo')).not.toThrow()
    expect(() => validateUrl('https://192.169.1.1/foo')).not.toThrow()
    expect(() => validateUrl('https://1.1.1.1/foo')).not.toThrow()
  })
})

describe('validateHostDns SSRF protection — DNS resolution', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    _setDnsLookup(null)
  })

  test('blocks hostname resolving to private IPv4', async () => {
    _setDnsLookup(async () => [{ address: '192.168.1.1', family: 4 }])
    await expect(validateHostDns('attacker.com')).rejects.toThrow(/private/i)
  })

  test('blocks if any resolved IP is private', async () => {
    _setDnsLookup(async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ])
    await expect(validateHostDns('mixed.example')).rejects.toThrow(/private/i)
  })

  test('allows hostname resolving to public IPv4', async () => {
    _setDnsLookup(async () => [{ address: '8.8.8.8', family: 4 }])
    await expect(validateHostDns('example.com')).resolves.toBeUndefined()
  })

  test('blocks loopback IPv6', async () => {
    _setDnsLookup(async () => [{ address: '::1', family: 6 }])
    await expect(validateHostDns('loop.example')).rejects.toThrow(/loopback/i)
  })

  test('blocks unique-local IPv6', async () => {
    _setDnsLookup(async () => [{ address: 'fc00::1', family: 6 }])
    await expect(validateHostDns('ula.example')).rejects.toThrow(/unique-local/i)
  })

  test('blocks link-local IPv6', async () => {
    _setDnsLookup(async () => [{ address: 'fe80::1', family: 6 }])
    await expect(validateHostDns('linklocal.example')).rejects.toThrow(/link-local/i)
  })

  test('blocks IPv4-mapped IPv6 private address', async () => {
    _setDnsLookup(async () => [{ address: '::ffff:192.168.1.1', family: 6 }])
    await expect(validateHostDns('mapped.example')).rejects.toThrow(/private/i)
  })

  test('allows public IPv6', async () => {
    _setDnsLookup(async () => [{ address: '2606:4700::1111', family: 6 }])
    await expect(validateHostDns('cloudflare.example')).resolves.toBeUndefined()
  })

  test('blocks when DNS lookup throws', async () => {
    _setDnsLookup(async () => { throw new Error('NXDOMAIN') })
    await expect(validateHostDns('missing.example')).rejects.toThrow(/DNS lookup failed/i)
  })

  test('blocks empty DNS results', async () => {
    _setDnsLookup(async () => [])
    await expect(validateHostDns('empty.example')).rejects.toThrow(/no records/i)
  })

  test('skips DNS lookup for IP literals already handled by validateUrl', async () => {
    _setDnsLookup(async () => { throw new Error('should not be called') })
    await expect(validateHostDns('1.2.3.4')).resolves.toBeUndefined()
    await expect(validateHostDns('[2606:4700::1111]')).resolves.toBeUndefined()
  })

  test('fetchHtml blocks hostname resolving to private IP before fetch', async () => {
    let fetchCalls = 0
    _setDnsLookup(async () => [{ address: '127.0.0.1', family: 4 }])
    globalThis.fetch = (async () => {
      fetchCalls++
      return new Response('<html>should not fetch</html>', { status: 200 })
    }) as typeof fetch

    await expect(fetchHtml('http://attacker.com/path')).rejects.toThrow(/loopback/i)
    expect(fetchCalls).toBe(0)
  })

  test('fetchHtml blocks redirect to hostname resolving to private IP', async () => {
    _setDnsLookup(async (hostname: string) => {
      if (hostname === 'attacker.com') return [{ address: '8.8.8.8', family: 4 }]
      if (hostname === 'internal.attacker.com') return [{ address: '192.168.1.1', family: 4 }]
      throw new Error(`unexpected lookup: ${hostname}`)
    })

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input.toString()
      if (u === 'http://attacker.com/start') {
        return new Response(null, { status: 302, headers: { Location: 'http://internal.attacker.com/' } })
      }
      return new Response('should not be reached', { status: 200 })
    }) as typeof fetch

    await expect(fetchHtml('http://attacker.com/start')).rejects.toThrow(/private/i)
  })

  test('fetchHtml allows public hostname resolution', async () => {
    _setDnsLookup(async () => [{ address: '8.8.8.8', family: 4 }])
    globalThis.fetch = (async () => new Response('<html><body>public ok</body></html>', { status: 200 })) as typeof fetch

    const result = await fetchHtml('http://example.com/')
    expect(result).toContain('public ok')
  })
})
