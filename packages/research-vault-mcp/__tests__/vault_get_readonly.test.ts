import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TMP = join(tmpdir(), 'vault_get_readonly_test')

function bodyText(size: number) {
  return 'x'.repeat(size)
}

function parseToolResult(result: { content: Array<{ text: string }>; isError?: boolean }) {
  return JSON.parse(result.content[0].text)
}

beforeEach(() => {
  try { rmSync(TMP, { recursive: true }) } catch {}
  mkdirSync(join(TMP, '.meta'), { recursive: true })
  mkdirSync(join(TMP, 'knowledge', 'test'), { recursive: true })
  process.env.VAULT_ROOT = TMP
})

describe('vault_get readonly surface', () => {
  test('is exposed by vaultTools and not vaultWriteTools', async () => {
    const { vaultTools } = await import('../src/vault.ts')
    const { vaultWriteTools } = await import('../src/vault_write.ts')

    expect(vaultTools.map(tool => tool.name)).toContain('vault_get')
    expect(vaultWriteTools.map(tool => tool.name)).not.toContain('vault_get')
  })

  test('input schema exposes id, include_content, and max_chars', async () => {
    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!

    expect(tool.inputSchema.required).toEqual(['id'])
    expect(tool.inputSchema.properties.id).toMatchObject({ type: 'string' })
    expect(tool.inputSchema.properties.include_content).toMatchObject({ type: 'boolean' })
    expect(tool.inputSchema.properties.max_chars).toMatchObject({ type: 'number' })
    expect(tool.inputSchema.properties).not.toHaveProperty('path')
  })

  test('returns a bounded excerpt by default without raw local paths', async () => {
    const notePath = join(TMP, 'knowledge', 'test', '20260509--long-note.md')
    writeFileSync(notePath, `# Long Note\n\n${bodyText(3000)}`, 'utf-8')

    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!
    const envelope = parseToolResult(await tool.call({ id: '20260509--long-note' }))

    expect(envelope.ok).toBe(true)
    expect(envelope.agent_guidance.verdict).toBe('PASS')
    expect(envelope.data.id).toBe('20260509--long-note')
    expect(envelope.data.source_ref).toBe('vault://knowledge/test/20260509--long-note')
    expect(envelope.data.content_kind).toBe('excerpt')
    expect(envelope.data.content.length).toBeLessThanOrEqual(1200)
    expect(envelope.data.truncated).toBe(true)
    expect(JSON.stringify(envelope)).not.toContain(TMP)
    expect(envelope.data).not.toHaveProperty('path')
  })

  test('include_content true respects max_chars and the hard cap', async () => {
    const notePath = join(TMP, 'knowledge', 'test', '20260509--huge-note.md')
    writeFileSync(notePath, `# Huge Note\n\n${bodyText(20000)}`, 'utf-8')

    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!

    const capped = parseToolResult(await tool.call({ id: '20260509--huge-note', include_content: true, max_chars: 2000 }))
    expect(capped.ok).toBe(true)
    expect(capped.data.content_kind).toBe('full')
    expect(capped.data.content.length).toBe(2000)
    expect(capped.data.max_chars).toBe(2000)
    expect(capped.data.truncated).toBe(true)

    const hardCapped = parseToolResult(await tool.call({ id: '20260509--huge-note', include_content: true, max_chars: 50000 }))
    expect(hardCapped.ok).toBe(true)
    expect(hardCapped.data.content.length).toBe(12000)
    expect(hardCapped.data.max_chars).toBe(12000)

    const zeroChars = parseToolResult(await tool.call({ id: '20260509--huge-note', include_content: true, max_chars: 0 }))
    expect(zeroChars.ok).toBe(true)
    expect(zeroChars.data.content).toBe('')
    expect(zeroChars.data.content.length).toBe(0)
    expect(zeroChars.data.chars_returned).toBe(0)
    expect(zeroChars.data.max_chars).toBe(0)
    expect(zeroChars.data.truncated).toBe(true)
  })

  test('max_chars cannot expand excerpts without include_content', async () => {
    const notePath = join(TMP, 'knowledge', 'test', '20260509--excerpt-gate.md')
    writeFileSync(notePath, `# Excerpt Gate\n\n${bodyText(5000)}`, 'utf-8')

    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!

    const expandedAttempt = parseToolResult(await tool.call({ id: '20260509--excerpt-gate', max_chars: 5000 }))
    expect(expandedAttempt.ok).toBe(true)
    expect(expandedAttempt.data.content_kind).toBe('excerpt')
    expect(expandedAttempt.data.content.length).toBe(1200)
    expect(expandedAttempt.data.max_chars).toBe(1200)
    expect(expandedAttempt.data.truncated).toBe(true)

    const lowerExcerpt = parseToolResult(await tool.call({ id: '20260509--excerpt-gate', max_chars: 64 }))
    expect(lowerExcerpt.ok).toBe(true)
    expect(lowerExcerpt.data.content_kind).toBe('excerpt')
    expect(lowerExcerpt.data.content.length).toBe(64)
    expect(lowerExcerpt.data.max_chars).toBe(64)
  })

  test('missing id and unknown id return BLOCK guidance to search first', async () => {
    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!

    const missingResult = await tool.call({} as never)
    const missing = parseToolResult(missingResult)
    expect(missingResult.isError).toBe(true)
    expect(missing.ok).toBe(false)
    expect(missing.agent_guidance.verdict).toBe('BLOCK')
    expect(missing.agent_guidance.next_step).toContain('vault_search')

    const unknownResult = await tool.call({ id: 'missing-note' })
    const unknown = parseToolResult(unknownResult)
    expect(unknownResult.isError).toBe(true)
    expect(unknown.ok).toBe(false)
    expect(unknown.agent_guidance.verdict).toBe('BLOCK')
    expect(unknown.agent_guidance.reason).toBe('No Research Vault note matched the requested id.')
    expect(unknown.agent_guidance.next_step).toContain('vault_search')
  })

  test('path-like unknown ids are not echoed in serialized error output', async () => {
    const pathLikeId = '/Users/alice/secret/file.md'

    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!
    const result = await tool.call({ id: pathLikeId })
    const serialized = result.content[0].text
    const envelope = parseToolResult(result)

    expect(result.isError).toBe(true)
    expect(serialized).not.toContain(pathLikeId)
    expect(serialized).not.toContain('/Users/alice')
    expect(envelope.ok).toBe(false)
    expect(envelope.evidence.public_safe).toBe(true)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.agent_guidance.reason).toBe('No Research Vault note matched the requested id.')
    expect(envelope.agent_guidance.next_step).toContain('vault_search')
  })

  test('does not resolve normalized-ish ids that are neither exact ids nor file stems', async () => {
    writeFileSync(join(TMP, 'knowledge', 'test', '1777777777777--normalized-note.md'), '# Normalized Note\n\nbody', 'utf-8')

    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!
    const result = await tool.call({ id: '1777777777777-normalized-note' })
    const envelope = parseToolResult(result)

    expect(result.isError).toBe(true)
    expect(envelope.ok).toBe(false)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.agent_guidance.reason).toBe('No Research Vault note matched the requested id.')
    expect(envelope.agent_guidance.next_step).toContain('vault_search')
  })

  test('finds exact id first and falls back to unique file stem', async () => {
    writeFileSync(join(TMP, 'knowledge', 'test', '1777777777777--stem-only.md'), '# Stem Only\n\nfallback', 'utf-8')

    const { vaultTools } = await import('../src/vault.ts')
    const tool = vaultTools.find(tool => tool.name === 'vault_get')!
    const byStem = parseToolResult(await tool.call({ id: '1777777777777--stem-only', max_chars: 200 }))

    expect(byStem.ok).toBe(true)
    expect(byStem.data.id).toBe('stem-only')
    expect(byStem.data.content).toContain('fallback')
  })
})
