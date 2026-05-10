import { beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  matchedFields,
  releaseMetadata,
  snippetFromContent,
  staleVerdict,
} from '../src/evidence_metadata.ts'

const TMP = join(tmpdir(), 'vault_evidence_metadata_test')

function parseToolResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text)
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

async function tool(name: string) {
  const { vaultTools } = await import('../src/vault.ts')
  const found = vaultTools.find((candidate: { name: string }) => candidate.name === name)
  if (!found) throw new Error(`missing tool ${name}`)
  return found
}

beforeEach(() => {
  try { rmSync(TMP, { recursive: true }) } catch {}
  mkdirSync(join(TMP, '.meta'), { recursive: true })
  mkdirSync(join(TMP, 'knowledge', 'test'), { recursive: true })
  mkdirSync(join(TMP, 'raw', '_inbox'), { recursive: true })
  process.env.VAULT_ROOT = TMP
  delete process.env.RESEARCH_VAULT_NPM_LATEST_VERSION
  delete process.env.RESEARCH_VAULT_NPM_MODIFIED_AT
  delete process.env.RESEARCH_VAULT_PUBLIC_REPO_URL
})

describe('evidence metadata helpers', () => {
  test('matchedFields identifies title and content hits', () => {
    const entry = {
      id: 'paper-a',
      title: 'Alpha Search Title',
      category: 'test',
      path: '/not/returned',
      modified: isoDaysAgo(1),
      size: 42,
      content: 'The body contains semantic needle evidence.',
    }

    expect(matchedFields(entry, 'search')).toContain('title')
    expect(matchedFields(entry, 'needle')).toContain('content')
  })

  test('snippetFromContent anchors near query and respects max length', () => {
    const content = `${'a'.repeat(80)} target phrase ${'b'.repeat(80)}`
    const snippet = snippetFromContent(content, 'target', 40)

    expect(snippet).toContain('target')
    expect(snippet.length).toBeLessThanOrEqual(40)
  })

  test('staleVerdict flags missing and old dates, and passes recent dates', () => {
    expect(staleVerdict().verdict).toBe('FLAG')
    expect(staleVerdict(isoDaysAgo(9)).verdict).toBe('FLAG')
    expect(staleVerdict(isoDaysAgo(1)).verdict).toBe('PASS')
  })

  test('releaseMetadata returns env values and FLAG shape when missing', () => {
    const present = releaseMetadata({
      RESEARCH_VAULT_NPM_LATEST_VERSION: '1.2.3',
      RESEARCH_VAULT_NPM_MODIFIED_AT: isoDaysAgo(1),
      RESEARCH_VAULT_PUBLIC_REPO_URL: 'https://github.com/Fearvox/dash-research-vault',
    }, { name: '@syndash/research-vault-mcp', version: '1.1.4' })

    expect(present.package_name).toBe('@syndash/research-vault-mcp')
    expect(present.local_version).toBe('1.1.4')
    expect(present.npm_latest_version).toBe('1.2.3')
    expect(present.public_repo).toBe('https://github.com/Fearvox/dash-research-vault')
    expect(present.freshness_verdict).toBe('PASS')

    const missing = releaseMetadata({}, { name: 'pkg', version: '0.0.1' })
    expect(missing.npm_latest_version).toBeNull()
    expect(missing.npm_modified_at).toBeNull()
    expect(missing.public_repo).toBeNull()
    expect(missing.freshness_verdict).toBe('FLAG')
  })
})

describe('vault read evidence metadata', () => {
  test('search result includes provenance, freshness, snippet, and no path', async () => {
    writeFileSync(
      join(TMP, 'knowledge', 'test', '20260509--semantic-note.md'),
      '# Semantic Note\n\nThis content has the needle phrase for matching.',
      'utf-8',
    )
    writeFileSync(join(TMP, '.meta', 'decay-scores.json'), JSON.stringify({
      '20260509--semantic-note': {
        itemId: '20260509--semantic-note',
        score: 0.8,
        lastAccess: isoDaysAgo(1),
        accessCount: 2,
        summaryLevel: 'deep',
        nextReviewAt: isoDaysAgo(-2),
        difficulty: 1,
        lastAnalyzedAt: isoDaysAgo(1),
      },
    }), 'utf-8')

    const search = await tool('vault_search')
    const envelope = parseToolResult(await search.call({ query: 'needle', limit: 5 }))
    const result = envelope.data.results[0]

    expect(envelope.ok).toBe(true)
    expect(envelope.agent_guidance).toBeDefined()
    expect(result.matched_fields).toContain('content')
    expect(result.why_matched).toContain('needle')
    expect(result.snippet).toContain('needle')
    expect(result.source_ref).toBe('vault://knowledge/test/20260509--semantic-note')
    expect(result.last_analyzed_at).toBeDefined()
    expect(result.source_mtime).toBeDefined()
    expect(result.freshness_verdict).toBe('PASS')
    expect(result).not.toHaveProperty('path')
    expect(JSON.stringify(envelope)).not.toContain(TMP)
  })

  test('status includes release, coverage, and freshness fields', async () => {
    process.env.RESEARCH_VAULT_NPM_LATEST_VERSION = '1.1.4'
    process.env.RESEARCH_VAULT_NPM_MODIFIED_AT = isoDaysAgo(1)
    process.env.RESEARCH_VAULT_PUBLIC_REPO_URL = 'https://github.com/Fearvox/dash-research-vault'
    writeFileSync(join(TMP, 'knowledge', 'test', '20260509--status-note.md'), '# Status Note\n\nbody', 'utf-8')
    writeFileSync(join(TMP, '.meta', 'decay-scores.json'), JSON.stringify({
      'status-note': {
        itemId: 'status-note',
        score: 0.5,
        lastAccess: isoDaysAgo(1),
        accessCount: 1,
        summaryLevel: 'shallow',
        nextReviewAt: isoDaysAgo(-2),
        difficulty: 1,
        lastAnalyzedAt: isoDaysAgo(1),
      },
    }), 'utf-8')

    const status = await tool('vault_status')
    const envelope = parseToolResult(await status.call({}))

    expect(envelope.ok).toBe(true)
    expect(envelope.data.as_of).toBeDefined()
    expect(envelope.data.last_analyzed_at).toBeDefined()
    expect(envelope.data.analyzed_coverage).toBe(1)
    expect(envelope.data.oldest_pending_age).toBeNull()
    expect(envelope.data.recent_throughput).toBe(1)
    expect(envelope.data.release.package_name).toBe('@syndash/research-vault-mcp')
    expect(envelope.data.release.local_version).toBeDefined()
    expect(envelope.data.release.npm_latest_version).toBe('1.1.4')
    expect(envelope.data.release.npm_modified_at).toBeDefined()
    expect(envelope.data.release.days_since_npm_update).toBeLessThanOrEqual(1)
    expect(envelope.data.release.public_repo).toBe('https://github.com/Fearvox/dash-research-vault')
    expect(envelope.agent_guidance.verdict).toBe('PASS')
  })

  test('status coverage ignores orphan decay scores and does not PASS from orphan freshness', async () => {
    process.env.RESEARCH_VAULT_NPM_LATEST_VERSION = '1.1.4'
    process.env.RESEARCH_VAULT_NPM_MODIFIED_AT = isoDaysAgo(1)
    process.env.RESEARCH_VAULT_PUBLIC_REPO_URL = 'https://github.com/Fearvox/dash-research-vault'
    writeFileSync(join(TMP, 'knowledge', 'test', '20260509--coverage-note.md'), '# Coverage Note\n\nbody', 'utf-8')
    writeFileSync(join(TMP, '.meta', 'decay-scores.json'), JSON.stringify({
      orphan_a: {
        itemId: 'orphan-a',
        score: 0.9,
        lastAccess: isoDaysAgo(1),
        accessCount: 1,
        summaryLevel: 'deep',
        nextReviewAt: isoDaysAgo(-2),
        difficulty: 1,
        lastAnalyzedAt: isoDaysAgo(1),
      },
      orphan_b: {
        itemId: 'orphan-b',
        score: 0.8,
        lastAccess: isoDaysAgo(1),
        accessCount: 1,
        summaryLevel: 'deep',
        nextReviewAt: isoDaysAgo(-2),
        difficulty: 1,
        lastAnalyzedAt: isoDaysAgo(1),
      },
    }), 'utf-8')

    const status = await tool('vault_status')
    const envelope = parseToolResult(await status.call({}))

    expect(envelope.data.total).toBe(1)
    expect(envelope.data.analyzed).toBe(0)
    expect(envelope.data.analyzed_coverage).toBe(0)
    expect(envelope.data.analyzed_coverage).toBeLessThanOrEqual(1)
    expect(envelope.data.recent_throughput).toBe(0)
    expect(envelope.data.last_analyzed_at).toBeNull()
    expect(envelope.agent_guidance.verdict).toBe('FLAG')
  })

  test('status pending count agrees with batch pending after raw item is already analyzed', async () => {
    writeFileSync(join(TMP, 'knowledge', 'test', '20260509--already-analyzed.md'), '# Already Analyzed\n\nbody', 'utf-8')
    writeFileSync(join(TMP, 'raw', '_inbox', '20260509--already-analyzed.md'), '# Already Analyzed\n\nraw duplicate', 'utf-8')
    writeFileSync(join(TMP, 'raw', '_inbox', '20260509--needs-analysis.md'), '# Needs Analysis\n\nraw body', 'utf-8')

    const status = await tool('vault_status')
    const batch = await tool('vault_batch_analyze')
    const statusEnvelope = parseToolResult(await status.call({}))
    const batchEnvelope = parseToolResult(await batch.call({ count: 10 }))

    expect(statusEnvelope.data.pending_raw).toBe(1)
    expect(batchEnvelope.data.pending).toBe(1)
    expect(statusEnvelope.data.pending_raw).toBe(batchEnvelope.data.pending)
    expect(batchEnvelope.data.preview.map((item: { id: string }) => item.id)).toEqual(['20260509--needs-analysis'])
  })

  test('batch analyze response omits command text and local path-shaped hints', async () => {
    const rawPath = join(TMP, 'raw', '_inbox', '20260509--queued-paper.md')
    writeFileSync(rawPath, '# Queued Paper\n\nbody', 'utf-8')
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    utimesSync(rawPath, old, old)

    const batch = await tool('vault_batch_analyze')
    const envelope = parseToolResult(await batch.call({ count: 5 }))
    const serialized = JSON.stringify(envelope)

    expect(envelope.ok).toBe(true)
    expect(envelope.agent_guidance.verdict).toBe('FLAG')
    expect(envelope.data.pending).toBe(1)
    expect(envelope.data.preview[0]).toMatchObject({
      id: '20260509--queued-paper',
      title: '20260509--queued-paper',
    })
    expect(envelope.data.oldest_pending_age).toBeGreaterThanOrEqual(1)
    expect(envelope.data.next_action).toBe('operator_run_batch_analysis')
    expect(serialized).not.toContain('bun run')
    expect(serialized).not.toContain('cd ')
    expect(serialized).not.toContain(TMP)
    expect(serialized).not.toContain('/Users/')
  })

  test('taxonomy response uses public-safe evidence envelope', async () => {
    writeFileSync(join(TMP, 'knowledge', '_taxonomy.md'), '# Taxonomy\n\n- test: safe category', 'utf-8')
    writeFileSync(join(TMP, 'knowledge', 'test', '20260509--taxonomy-note.md'), '# Taxonomy Note\n\nbody', 'utf-8')

    const taxonomy = await tool('vault_taxonomy')
    const envelope = parseToolResult(await taxonomy.call({}))

    expect(envelope.ok).toBe(true)
    expect(envelope.agent_guidance).toBeDefined()
    expect(envelope.agent_guidance.verdict).toBe('PASS')
    expect(envelope.evidence).toBeDefined()
    expect(envelope.evidence.public_safe).toBe(true)
    expect(envelope.data.taxonomy).toContain('safe category')
    expect(envelope.data.categories.test).toBe(1)
  })

  test('taxonomy response redacts unsafe source content and blocks public envelope', async () => {
    writeFileSync(
      join(TMP, 'knowledge', '_taxonomy.md'),
      '# Taxonomy\n\nOperator note: /Users/alice/private.md on 203.0.113.42',
      'utf-8',
    )

    const taxonomy = await tool('vault_taxonomy')
    const envelope = parseToolResult(await taxonomy.call({}))
    const serialized = JSON.stringify(envelope)

    expect(envelope.ok).toBe(false)
    expect(envelope.agent_guidance.verdict).toBe('BLOCK')
    expect(envelope.evidence.public_safe).toBe(false)
    expect(serialized).toContain('[REDACTED_LOCAL_PATH]')
    expect(serialized).toContain('[REDACTED_IPV4]')
    expect(serialized).not.toContain('/Users/alice')
    expect(serialized).not.toContain('203.0.113.42')
  })
})
