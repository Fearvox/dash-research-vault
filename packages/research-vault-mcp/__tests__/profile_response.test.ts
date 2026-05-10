import { describe, expect, test } from 'bun:test'
import { getActiveProfile } from '../src/profile.ts'
import { okEnvelope } from '../src/response.ts'
import { scanPublicSafety } from '../src/public_safety.ts'
import { blockedToolResponse } from '../src/tool_policy.ts'

describe('MCP profile and response foundations', () => {
  test('default and unknown profile resolve to readonly', () => {
    expect(getActiveProfile({})).toBe('readonly')
    expect(getActiveProfile({ MCP_PROFILE: 'unknown' })).toBe('readonly')
    expect(getActiveProfile({ RESEARCH_VAULT_MCP_PROFILE: 'writer' })).toBe('readonly')
  })

  test('explicit full and admin profiles are accepted', () => {
    expect(getActiveProfile({ MCP_PROFILE: 'full' })).toBe('full')
    expect(getActiveProfile({ MCP_PROFILE: 'admin' })).toBe('admin')
    expect(getActiveProfile({ RESEARCH_VAULT_MCP_PROFILE: 'FULL' })).toBe('full')
  })

  test('unsafe public values are redacted before returning data and block the envelope', () => {
    const envelope = okEnvelope({
      path: '/Users/alice/Documents/Evensong/research-vault/private.md',
      host: '203.0.113.42',
      token: 'sk-1234567890abcdefghijklmnop',
      command: 'ssh alice@203.0.113.42',
      nested: ['safe', 'ghp_1234567890abcdefghijklmnop'],
    })

    expect(envelope.ok).toBe(false)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.evidence.public_safe).toBe(false)
    expect(String(envelope.data)).not.toContain('/Users/alice')
    expect(JSON.stringify(envelope.data)).not.toContain('203.0.113.42')
    expect(JSON.stringify(envelope.data)).not.toContain('sk-1234567890abcdefghijklmnop')
    expect(JSON.stringify(envelope.data)).toContain('[REDACTED_LOCAL_PATH]')
    expect(JSON.stringify(envelope.data)).toContain('[REDACTED_IPV4]')
    expect(JSON.stringify(envelope.data)).toContain('[REDACTED_TOKEN]')
    expect(JSON.stringify(envelope.data)).toContain('[REDACTED_OPERATOR_COMMAND]')
  })

  test('repeated public-safety scans are stable', () => {
    const unsafe = 'ssh user@198.51.100.10 with sk-1234567890abcdefghijklmnop'

    const first = scanPublicSafety(unsafe)
    const second = scanPublicSafety(unsafe)

    expect(first.public_safe).toBe(false)
    expect(second.public_safe).toBe(false)
    expect(first.reasons.sort()).toEqual(second.reasons.sort())
  })

  test('unsafe object keys are redacted and block response envelopes', () => {
    const envelope = okEnvelope({
      '/Users/alice/Secret Folder/file.md': 'ok',
    })
    const serialized = JSON.stringify(envelope.data)

    expect(envelope.ok).toBe(false)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.evidence.safety_reasons).toContain('local_home_path')
    expect(serialized).toContain('[REDACTED_LOCAL_PATH]')
    expect(serialized).not.toContain('/Users/alice')
    expect(serialized).not.toContain('Secret Folder/file.md')
  })

  test('redacts complete local home paths with space-bearing segments', () => {
    const envelope = okEnvelope({
      path: '/Users/alice/My Documents/private.md',
      quoted: 'open "/Users/alice/My Documents/private file.md"',
    })
    const serialized = JSON.stringify(envelope.data)

    expect(envelope.ok).toBe(false)
    expect(serialized).toContain('[REDACTED_LOCAL_PATH]')
    expect(serialized).not.toContain('My Documents/private.md')
    expect(serialized).not.toContain('private file.md')
  })

  test('embedded ssh scp and rsync command shapes are redacted', () => {
    const scan = scanPublicSafety({
      ssh: 'operator ran ssh alice@203.0.113.42',
      scp: 'then scp ./bundle alice@203.0.113.42:/tmp/bundle',
      rsync: 'and rsync -av ./docs alice@203.0.113.42:/tmp/docs',
    })
    const serialized = JSON.stringify(scan.redacted)

    expect(scan.public_safe).toBe(false)
    expect(scan.reasons).toContain('operator_command')
    expect(serialized.match(/\[REDACTED_OPERATOR_COMMAND\]/g)).toHaveLength(3)
    expect(serialized).not.toContain('ssh alice@')
    expect(serialized).not.toContain('scp ./bundle')
    expect(serialized).not.toContain('rsync -av')
  })

  test('nested arrays and objects redact unsafe keys and values', () => {
    const scan = scanPublicSafety({
      nested: [
        {
          '/Users/alice/Nested Folder/private.md': [
            'token ghp_1234567890abcdefghijklmnop',
            { host: '198.51.100.10' },
          ],
        },
      ],
    })
    const serialized = JSON.stringify(scan.redacted)

    expect(scan.public_safe).toBe(false)
    expect(scan.reasons).toEqual(expect.arrayContaining(['local_home_path', 'token', 'ipv4']))
    expect(serialized).toContain('[REDACTED_LOCAL_PATH]')
    expect(serialized).toContain('[REDACTED_TOKEN]')
    expect(serialized).toContain('[REDACTED_IPV4]')
    expect(serialized).not.toContain('/Users/alice')
    expect(serialized).not.toContain('ghp_1234567890abcdefghijklmnop')
    expect(serialized).not.toContain('198.51.100.10')
  })

  test('non-plain objects are preserved by public data sanitization', () => {
    const date = new Date('2026-05-09T00:00:00.000Z')
    const map = new Map([['/Users/alice/private.md', 'value']])
    const error = new Error('/Users/alice/private.md')

    expect(scanPublicSafety({ date }).redacted).toEqual({ date })
    expect(scanPublicSafety({ map }).redacted).toEqual({ map })
    expect(scanPublicSafety({ error }).redacted).toEqual({ error })
  })

  test('class instances with enumerable unsafe fields are blocked and redacted', () => {
    class Leak {
      path = '/Users/alice/private.md'
      host = '203.0.113.42'
    }

    const envelope = okEnvelope({ leak: new Leak() })
    const serialized = JSON.stringify(envelope.data)

    expect(envelope.ok).toBe(false)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.evidence.public_safe).toBe(false)
    expect(serialized).toContain('[REDACTED_LOCAL_PATH]')
    expect(serialized).toContain('[REDACTED_IPV4]')
    expect(serialized).not.toContain('/Users/alice/private.md')
    expect(serialized).not.toContain('203.0.113.42')
  })

  test('blocked destructive tools recommend admin profile when full is insufficient', () => {
    const response = blockedToolResponse('vault_delete', 'full')
    const envelope = JSON.parse(response.content[0].text)

    expect(response.isError).toBe(true)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.agent_guidance.next_step).toContain('MCP_PROFILE=admin')
    expect(envelope.agent_guidance.next_step).toContain('readonly/full')
    expect(envelope.agent_guidance.next_step).not.toContain('mutation-capable profile')
  })
})
