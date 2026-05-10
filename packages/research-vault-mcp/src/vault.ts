// Research Vault MCP Tools
// Resolves vault root via env override, else defaults to the actual data location.
// After Phase 07 T3, CCR/research-vault is a submodule of ds-research-vault.

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'
import { getVaultEntry } from './vault_get.ts'
import type { DecayScore, VaultEntry, VaultGetInput } from './types.ts'
import { flagGuidance, passGuidance } from './guidance.ts'
import { okEnvelope } from './response.ts'
import {
  coverageMetadata,
  itemFreshness,
  matchedFields,
  queueFreshness,
  releaseMetadata,
  snippetFromContent,
  staleVerdict,
  whyMatched,
} from './evidence_metadata.ts'

const DEFAULT_VAULT_ROOT = `${homedir()}/Documents/Evensong/research-vault`

function getVaultRoot(): string {
  return process.env.VAULT_ROOT ?? DEFAULT_VAULT_ROOT
}

function getKnowledgeDir(): string {
  return join(getVaultRoot(), 'knowledge')
}

function getRawDir(): string {
  return join(getVaultRoot(), 'raw')
}

function getDecayPath(): string {
  return join(getVaultRoot(), '.meta', 'decay-scores.json')
}

function getTaxonomyPath(): string {
  return join(getVaultRoot(), 'knowledge', '_taxonomy.md')
}

function getPackageJson(): { name?: string; version?: string } {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))
  } catch {
    return {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeId(raw: string): string {
  return raw
    .replace(/^\d{8}--?\d{4}-/, '')
    .replace(/^(\d{10,})--?/, '')
    .replace(/\.md$/, '')
}

export function normalizeDecayScoresStore(parsed: unknown): DecayScore[] {
  if (Array.isArray(parsed)) return parsed as DecayScore[]
  if (parsed && typeof parsed === 'object') return Object.values(parsed) as DecayScore[]
  return []
}

function loadDecayScores(): DecayScore[] {
  try {
    const parsed = JSON.parse(readFileSync(getDecayPath(), 'utf-8'))
    return normalizeDecayScoresStore(parsed)
  } catch {
    return []
  }
}

function loadTaxonomy(): string {
  try {
    return readFileSync(getTaxonomyPath(), 'utf-8')
  } catch {
    return ''
  }
}

function loadFileMeta(filePath: string): { title: string; modified: string; size: number } {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    let title = ''
    for (const line of lines.slice(0, 30)) {
      const m = line.match(/^#\s+(.+)/)
      if (m) { title = m[1]; break }
    }
    const s = statSync(filePath)
    return {
      title: title || normalizeId(basename(filePath)),
      modified: s.mtime.toISOString(),
      size: s.size
    }
  } catch {
    return { title: normalizeId(basename(filePath)), modified: '', size: 0 }
  }
}

function scanKnowledge(): VaultEntry[] {
  const entries: VaultEntry[] = []
  const knowledgeDir = getKnowledgeDir()
  if (!existsSync(knowledgeDir)) return entries

  const categories = readdirSync(knowledgeDir)
  for (const cat of categories) {
    if (cat.startsWith('_')) continue
    const catPath = join(knowledgeDir, cat)
    if (!existsSync(catPath) || !statSync(catPath).isDirectory()) continue

    const subEntries = readdirSync(catPath)
    for (const sub of subEntries) {
      const subPath = join(catPath, sub)
      const subStat = statSync(subPath)

      if (subStat.isDirectory()) {
        const files = readdirSync(subPath).filter(f => f.endsWith('.md'))
        for (const file of files) {
          const fp = join(subPath, file)
          const meta = loadFileMeta(fp)
          entries.push({
            id: normalizeId(file),
            title: meta.title,
            category: `${cat}/${sub}`,
            path: fp,
            modified: meta.modified,
            size: meta.size
          })
        }
      } else if (sub.endsWith('.md')) {
        const meta = loadFileMeta(subPath)
        entries.push({
          id: normalizeId(sub),
          title: meta.title,
          category: cat,
          path: subPath,
          modified: meta.modified,
          size: meta.size
        })
      }
    }
  }
  return entries
}

function scanRaw(): string[] {
  const pending: string[] = []
  const rawDir = getRawDir()
  if (!existsSync(rawDir)) return pending

  try {
    const entries = readdirSync(rawDir)
    for (const entry of entries) {
      if (entry === '_inbox') {
        const inbox = join(rawDir, entry)
        if (existsSync(inbox)) {
          pending.push(...readdirSync(inbox).filter(f => /\.(md|pdf|txt)$/.test(f)))
        }
      } else if (/^\d{4}-\d{2}$/.test(entry)) {
        const monthDir = join(rawDir, entry)
        if (existsSync(monthDir)) {
          pending.push(
            ...readdirSync(monthDir)
              .filter(f => /\.(md|pdf|txt)$/.test(f))
              .map(f => `${entry}/${f}`)
          )
        }
      }
    }
  } catch {}

  return pending
}

function scanRawQueueItems() {
  const rawDir = getRawDir()
  return scanRaw().map(item => {
    let filePath = join(rawDir, item)
    if (!existsSync(filePath)) filePath = join(rawDir, '_inbox', item)
    let sourceMtime: string | null = null
    try {
      sourceMtime = statSync(filePath).mtime.toISOString()
    } catch {}

    const title = normalizeId(basename(item)).replace(/\.[^.]+$/, '')
    return {
      id: normalizeId(basename(item)).replace(/\.[^.]+$/, ''),
      title,
      source_mtime: sourceMtime,
    }
  })
}

function entryScoreAliases(entry: VaultEntry): Set<string> {
  const stem = basename(entry.path).replace(/\.md$/, '')
  const aliases = new Set([
    entry.id,
    stem,
    normalizeId(entry.id),
    normalizeId(stem),
    entry.id.replace(/--/g, '-'),
    stem.replace(/--/g, '-'),
  ])

  const datePrefixed = stem.match(/^\d{8}--(.+)$/)
  if (datePrefixed) aliases.add(datePrefixed[1])

  return aliases
}

function scoreAliases(score: DecayScore): Set<string> {
  return new Set([
    score.itemId,
    normalizeId(score.itemId),
    score.itemId.replace(/--/g, '-'),
  ])
}

function scoreMatchesEntry(score: DecayScore, entry: VaultEntry): boolean {
  const entryAliases = entryScoreAliases(entry)
  return [...scoreAliases(score)].some(alias => entryAliases.has(alias))
}

function matchedScoresForEntries<T extends DecayScore>(scores: T[], entries: VaultEntry[]): T[] {
  return scores.filter(score => entries.some(entry => scoreMatchesEntry(score, entry)))
}

function pendingRawQueueItems(entries: VaultEntry[]) {
  const analyzedIds = new Set(entries.flatMap(entry => [...entryScoreAliases(entry)]))
  return scanRawQueueItems().filter(item => !analyzedIds.has(normalizeId(item.id)))
}

function sourceRef(entry: VaultEntry): string {
  return `vault://knowledge/${entry.category}/${entry.id}`
}

function readEntryContent(entry: VaultEntry): string {
  try {
    return readFileSync(entry.path, 'utf-8')
  } catch {
    return ''
  }
}

function scoreForEntry(scoreMap: Map<string, DecayScore & { lastAnalyzedAt?: string }>, item: VaultEntry) {
  return [...entryScoreAliases(item)]
    .map(alias => scoreMap.get(alias))
    .find(Boolean)
}

// ─── MCP Tools ───────────────────────────────────────────────────────────────

const vaultTools = [
  {
    name: 'vault_get',
    description: 'Read a bounded public-safe excerpt or capped content from a Research Vault note by id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Research Vault note id returned by vault_search' },
        include_content: { type: 'boolean', description: 'Return capped content instead of the default excerpt' },
        max_chars: { type: 'number', description: 'Maximum returned content characters, capped at 12000' }
      },
      required: ['id']
    },
    call: async (args: VaultGetInput) => {
      const result = getVaultEntry(args, scanKnowledge())
      return {
        content: [{ type: 'text', text: JSON.stringify(result.envelope, null, 2) }],
        ...(result.isError ? { isError: true } : {})
      }
    }
  },

  {
    name: 'vault_search',
    description: 'Search the Research Vault knowledge base. Returns analyzed papers with retention scores.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (matches title, content, id, and category)' },
        category: { type: 'string', description: 'Filter by category (e.g., "ai-agents/benchmarking")' },
        limit: { type: 'number', description: 'Max results (default 10)' }
      }
    },
    call: async ({ query, category, limit = 10 }: { query?: string; category?: string; limit?: number }) => {
      let items = scanKnowledge()
      const scores = loadDecayScores() as Array<DecayScore & { lastAnalyzedAt?: string }>
      const scoreMap = new Map(scores.flatMap(s => [...scoreAliases(s)].map(alias => [alias, s] as const)))

      if (category) {
        items = items.filter(item =>
          item.category === category || item.category.startsWith(category + '/')
        )
      }

      if (query) {
        items = items.filter(item => {
          const content = readEntryContent(item)
          return matchedFields({ ...item, content }, query).length > 0
        })
      }

      const results = items.slice(0, limit).map(item => {
        const content = readEntryContent(item)
        const score = scoreForEntry(scoreMap, item)
        const fields = matchedFields({ ...item, content }, query)
        const freshness = itemFreshness({ ...item, score })
        return {
          id: item.id,
          title: item.title,
          category: item.category,
          score: score?.score ?? null,
          summaryLevel: score?.summaryLevel ?? null,
          nextReview: score?.nextReviewAt ?? null,
          accessCount: score?.accessCount ?? 0,
          modified: item.modified,
          matched_fields: fields,
          why_matched: whyMatched({ ...item, content }, query, fields),
          snippet: snippetFromContent(content, query, 280),
          source_ref: sourceRef(item),
          section_anchor: undefined,
          canonical_group: undefined,
          ...freshness,
        }
      })

      const hasStale = results.some(result => result.freshness_verdict === 'FLAG')
      const envelope = okEnvelope(
        { query, category, results, total: results.length },
        hasStale
          ? flagGuidance(
            'Search completed, but one or more results lack fresh analysis metadata.',
            'Use source_ref for readonly follow-up and refresh analysis metadata in the operator lane if needed.',
            'vault_get',
          )
          : passGuidance(
            'Search completed with provenance and freshness metadata.',
            'Use source_ref or vault_get for bounded follow-up evidence.',
            'vault_get',
          ),
        {
          freshness: hasStale ? 'Some search results are missing or stale analysis timestamps.' : 'Search result analysis metadata is fresh.',
          provenance: 'vault_search result source_ref values are vault:// references without local paths.',
        },
      )

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(envelope, null, 2)
        }]
      }
    }
  },

  {
    name: 'vault_status',
    description: 'Get Research Vault health — item counts by decay level, top/bottom retention.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      const scores = loadDecayScores() as Array<DecayScore & { lastAnalyzedAt?: string }>
      const entries = scanKnowledge()
      const matchedScores = matchedScoresForEntries(scores, entries)
      const deep = matchedScores.filter(s => s.summaryLevel === 'deep')
      const shallow = matchedScores.filter(s => s.summaryLevel === 'shallow')
      const none = matchedScores.filter(s => s.summaryLevel === 'none')
      const sorted = [...matchedScores].sort((a, b) => b.score - a.score)
      const queueItems = pendingRawQueueItems(entries)
      const coverage = coverageMetadata({
        total: entries.length,
        analyzed: matchedScores.length,
        scores: matchedScores,
        queueItems,
      })
      const release = releaseMetadata(process.env, getPackageJson())

      const top5 = sorted.slice(0, 5).map(s => {
        const sid = s.itemId.replace(/--/g, '-')
        const entry = entries.find(e => normalizeId(e.id) === normalizeId(s.itemId) || normalizeId(e.id) === normalizeId(sid))
        return { itemId: s.itemId, score: s.score, accesses: s.accessCount, title: entry?.title || s.itemId }
      })
      const bottom5 = sorted.slice(-5).reverse().map(s => {
        const sid = s.itemId.replace(/--/g, '-')
        const entry = entries.find(e => normalizeId(e.id) === normalizeId(s.itemId) || normalizeId(e.id) === normalizeId(sid))
        return { itemId: s.itemId, score: s.score, lastAccess: s.lastAccess.slice(0, 10), title: entry?.title || s.itemId }
      })

      const statusData = {
        total: entries.length,
        analyzed: matchedScores.length,
        deep: deep.length,
        shallow: shallow.length,
        dormant: none.length,
        pending_raw: queueItems.length,
        top5,
        bottom5,
        ...coverage,
        release,
      }
      const releaseFlag = release.freshness_verdict === 'FLAG'
      const analysisFlag = staleVerdict(coverage.last_analyzed_at).verdict === 'FLAG'
      const envelope = okEnvelope(
        statusData,
        releaseFlag || analysisFlag
          ? flagGuidance(
            releaseFlag
              ? 'Vault status is available, but release freshness was not fully provided by the runtime environment.'
              : 'Vault status is available, but analysis freshness is stale or missing.',
            releaseFlag
              ? 'Set RESEARCH_VAULT_NPM_LATEST_VERSION, RESEARCH_VAULT_NPM_MODIFIED_AT, and RESEARCH_VAULT_PUBLIC_REPO_URL in the runtime environment.'
              : 'Run the operator analysis lane before relying on freshness-sensitive claims.',
          )
          : passGuidance(
            'Vault status includes coverage, queue freshness, and release metadata.',
            'Use pending_raw and oldest_pending_age to decide whether operator analysis is needed.',
          ),
        {
          as_of: coverage.as_of,
          freshness: analysisFlag ? 'Analysis freshness is stale or missing.' : 'Analysis freshness is within the accepted window.',
          release: release.freshness_verdict,
        },
      )

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(envelope, null, 2)
        }]
      }
    }
  },

  {
    name: 'vault_batch_analyze',
    description: 'Check batch analyze status and pending papers in the raw queue.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Preview N papers (default 5)' }
      }
    },
    call: async ({ count = 5 }: { count?: number } = {}) => {
      const entries = scanKnowledge()
      const unanalyzed = pendingRawQueueItems(entries)
      const freshness = queueFreshness(unanalyzed)

      if (unanalyzed.length === 0) {
        const envelope = okEnvelope(
          {
            message: 'Queue empty; all visible raw papers are analyzed.',
            analyzed: entries.length,
            pending: 0,
            preview: [],
            oldest_pending_age: null,
            next_action: 'none',
          },
          passGuidance(
            'Batch analysis queue is empty.',
            'No operator batch analysis action is needed.',
          ),
        )
        return { content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }] }
      }

      const envelope = okEnvelope(
        {
          message: `${unanalyzed.length} papers pending analysis`,
          pending: unanalyzed.length,
          preview: unanalyzed.slice(0, count).map(item => ({
            id: item.id,
            title: item.title,
          })),
          oldest_pending_age: freshness.oldest_pending_age,
          oldest_pending_at: freshness.oldest_pending_at,
          next_action: 'operator_run_batch_analysis',
        },
        flagGuidance(
          'Raw queue has pending items that require operator-side batch analysis.',
          'Run the private operator batch analysis lane; this public response intentionally omits shell commands and local paths.',
        ),
        {
          freshness: freshness.oldest_pending_age === null
            ? 'Pending queue age could not be calculated.'
            : `Oldest pending item is ${freshness.oldest_pending_age} days old.`,
          provenance: 'Queue preview exposes ids and titles only.',
        },
      )

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(envelope, null, 2)
        }]
      }
    }
  },

  {
    name: 'vault_taxonomy',
    description: 'Get the Research Vault taxonomy — all categories and counts.',
    inputSchema: { type: 'object', properties: {} },
    call: async () => {
      const taxonomy = loadTaxonomy()
      const entries = scanKnowledge()
      const catCounts: Record<string, number> = {}
      for (const e of entries) catCounts[e.category] = (catCounts[e.category] || 0) + 1
      const envelope = okEnvelope(
        { taxonomy, categories: catCounts },
        passGuidance(
          'Taxonomy loaded with public-safe evidence metadata.',
          'Use category counts for readonly routing and vault_search for bounded follow-up evidence.',
          'vault_search',
        ),
        {
          provenance: 'Taxonomy response is sanitized through the public-safe envelope before serialization.',
        },
      )

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(envelope, null, 2)
        }]
      }
    }
  }
]

export { vaultTools, scanKnowledge, scanRaw, loadDecayScores, normalizeId }
