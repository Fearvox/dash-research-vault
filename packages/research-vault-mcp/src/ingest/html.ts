// packages/research-vault-mcp/src/ingest/html.ts

import type { LookupAddress } from 'dns'

type DnsLookupFn = (hostname: string) => Promise<LookupAddress[]>

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  const { lookup } = await import('dns/promises')
  return lookup(hostname, { all: true })
}

let dnsLookup: DnsLookupFn = defaultLookup

export function _setDnsLookup(fn: DnsLookupFn | null): void {
  dnsLookup = fn ?? defaultLookup
}

/**
 * Validate URL to prevent SSRF attacks.
 * Blocks: private IPv4/IPv6 ranges, loopback, link-local, cloud metadata
 * endpoints, invalid schemes, and forbidden hostname literals. DNS-backed
 * hostname checks happen in validateHostDns(), which safeFetch calls per hop.
 */
export function validateUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }

  const scheme = parsed.protocol.toLowerCase()
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new Error(`URL scheme not allowed: ${scheme}. Only http/https permitted.`)
  }

  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase()
  validateHostnameLiteralPolicy(hostname)

  if (hostname.includes(':')) {
    validateIpv6(hostname, hostname)
    return
  }

  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipMatch) {
    validateIpv4(hostname, hostname)
    return
  }
}

function validateHostnameLiteralPolicy(hostname: string): void {
  if (hostname === 'localhost' || hostname === 'metadata.google.internal') {
    throw new Error(`Hostname not permitted: ${hostname}`)
  }
}

function validateIpv4(ip: string, originalHostname: string): void {
  const parts = ip.split('.').map(p => parseInt(p, 10))
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${originalHostname}`)
  }
  const [a, b] = parts

  if (a === 0) throw new Error(`Reserved IP blocked: ${originalHostname}`)
  if (a === 10) throw new Error(`Private IP blocked: ${originalHostname}`)
  if (a === 127) throw new Error(`Loopback IP blocked: ${originalHostname}`)
  if (a === 169 && b === 254 && parts[2] === 169 && parts[3] === 254) {
    throw new Error(`Cloud metadata endpoint blocked: ${originalHostname}`)
  }
  if (a === 169 && b === 254) throw new Error(`Link-local IP blocked: ${originalHostname}`)
  if (a === 172 && b >= 16 && b <= 31) throw new Error(`Private IP blocked: ${originalHostname}`)
  if (a === 192 && b === 168) throw new Error(`Private IP blocked: ${originalHostname}`)
}

function validateIpv6(ip: string, originalHostname: string): void {
  const stripped = ip.toLowerCase().split('%')[0]
  if (stripped === '::1' || stripped === '::') {
    throw new Error(`IPv6 loopback/unspecified blocked: ${originalHostname}`)
  }
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(stripped)) {
    throw new Error(`IPv6 unique-local blocked: ${originalHostname}`)
  }
  if (/^fe[89ab][0-9a-f]?:/i.test(stripped)) {
    throw new Error(`IPv6 link-local blocked: ${originalHostname}`)
  }
  const mappedV4 = stripped.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedV4) {
    validateIpv4(mappedV4[1], originalHostname)
  }
}

/**
 * Resolve hostname via DNS and validate every returned IP against private,
 * loopback, link-local, and cloud-metadata ranges. This closes the static
 * hostname-to-private-IP SSRF gap.
 *
 * Residual risk: this narrows but does not fully close the DNS rebinding TOCTOU
 * window between this lookup and fetch()'s own internal lookup. Full mitigation
 * requires IP pinning, which is HTTPS-incompatible here without TLS SNI control.
 */
export async function validateHostDns(hostname: string): Promise<void> {
  const stripped = hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase()
  validateHostnameLiteralPolicy(stripped)

  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(stripped)) return
  if (stripped.includes(':')) return

  let resolved: LookupAddress[]
  try {
    resolved = await dnsLookup(stripped)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`DNS lookup failed for ${hostname}: ${msg}`)
  }

  if (!resolved || resolved.length === 0) {
    throw new Error(`DNS lookup returned no records for ${hostname}`)
  }

  for (const { address, family } of resolved) {
    if (family === 4) validateIpv4(address, hostname)
    else if (family === 6) validateIpv6(address, hostname)
  }
}

const MAX_REDIRECTS = 5

/**
 * fetch wrapper that follows redirects manually, re-validating each hop with
 * validateUrl() and validateHostDns(). Redirects to private IP literals or
 * hostnames resolving to private IPs are blocked before fetch follows them.
 */
async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let currentUrl = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    validateUrl(currentUrl)
    const parsed = new URL(currentUrl)
    const hostname = parsed.hostname.replace(/^\[(.*)\]$/, '$1')
    await validateHostDns(hostname)

    const res = await fetch(currentUrl, { ...init, redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) {
      return res
    }
    const location = res.headers.get('location')
    if (!location) {
      return res
    }
    currentUrl = new URL(location, currentUrl).toString()
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`)
}

/**
 * Fetch a URL and convert HTML to plain markdown-like text.
 * Strips scripts, styles, nav, footer, header, aside elements.
 * Uses Bun's native fetch — no external dependencies.
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await safeFetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 research-vault-mcp/1.1.0',
      'Accept': 'text/html'
    }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const html = await res.text()

  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Block elements → newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n')

  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '')

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim()

  return text
}
