import type { DecayScore, VaultEntry } from './types.ts'

export type FreshnessVerdict = 'PASS' | 'FLAG'

export interface FreshnessShape {
  verdict: FreshnessVerdict
  reason: string
}

const STALE_AFTER_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lower(value: string | undefined | null): string {
  return (value ?? '').toLowerCase()
}

function queryTerms(query?: string): string[] {
  return lower(query)
    .split(/\s+/)
    .map(term => term.trim())
    .filter(Boolean)
}

function includesQuery(value: string | undefined, query?: string): boolean {
  const terms = queryTerms(query)
  if (terms.length === 0) return false
  const haystack = lower(value)
  return terms.some(term => haystack.includes(term))
}

export function matchedFields(entry: VaultEntry & { content?: string }, query?: string): string[] {
  if (!query?.trim()) return []

  const candidates: Array<[string, string | undefined]> = [
    ['title', entry.title],
    ['content', entry.content],
    ['id', entry.id],
    ['category', entry.category],
  ]

  return candidates
    .filter(([, value]) => includesQuery(value, query))
    .map(([field]) => field)
}

export function whyMatched(entry: VaultEntry & { content?: string }, query: string | undefined, fields: string[]): string {
  if (!query?.trim()) return 'No query provided; result is included by category or default listing.'
  if (fields.length === 0) return 'Result is included after filters; no direct field match was detected.'

  const labels = fields.map(field => {
    if (field === 'title') return 'title'
    if (field === 'content') return 'note content'
    if (field === 'category') return 'category'
    return field
  })

  return `Matched query "${query}" in ${labels.join(', ')}.`
}

export function snippetFromContent(content: string, query?: string, maxChars = 240): string {
  const limit = Math.max(0, Math.floor(maxChars))
  if (limit === 0) return ''

  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized

  const terms = queryTerms(query)
  const lowerContent = lower(normalized)
  const hitIndex = terms
    .map(term => lowerContent.indexOf(term))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0]

  if (hitIndex === undefined) return normalized.slice(0, limit).trimEnd()

  const halfWindow = Math.floor(limit / 2)
  const start = Math.max(0, Math.min(hitIndex - halfWindow, normalized.length - limit))
  const end = Math.min(normalized.length, start + limit)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < normalized.length ? '...' : ''
  const available = Math.max(0, limit - prefix.length - suffix.length)
  return `${prefix}${normalized.slice(start, start + available).trim()}${suffix}`
}

export function staleVerdict(lastAnalyzedAt?: string | null): FreshnessShape {
  if (!lastAnalyzedAt) {
    return { verdict: 'FLAG', reason: 'No analysis timestamp was provided.' }
  }

  const timestamp = Date.parse(lastAnalyzedAt)
  if (Number.isNaN(timestamp)) {
    return { verdict: 'FLAG', reason: 'Analysis timestamp could not be parsed.' }
  }

  const ageDays = Math.floor((Date.now() - timestamp) / DAY_MS)
  if (ageDays > STALE_AFTER_DAYS) {
    return { verdict: 'FLAG', reason: `Analysis is ${ageDays} days old.` }
  }

  return { verdict: 'PASS', reason: 'Analysis is fresh enough for the read surface.' }
}

export function itemFreshness(entry: VaultEntry & { score?: DecayScore & { lastAnalyzedAt?: string } }) {
  const lastAnalyzedAt = entry.score?.lastAnalyzedAt ?? null
  const verdict = staleVerdict(lastAnalyzedAt)

  return {
    last_analyzed_at: lastAnalyzedAt,
    source_mtime: entry.modified || null,
    freshness_verdict: verdict.verdict,
    freshness_reason: verdict.reason,
  }
}

export function queueFreshness(queueItems: Array<{ source_mtime?: string | null }>) {
  const timestamps = queueItems
    .map(item => item.source_mtime ? Date.parse(item.source_mtime) : NaN)
    .filter(timestamp => !Number.isNaN(timestamp))

  if (timestamps.length === 0) {
    return {
      oldest_pending_age: null as number | null,
      oldest_pending_at: null as string | null,
    }
  }

  const oldest = Math.min(...timestamps)
  return {
    oldest_pending_age: Math.max(0, Math.floor((Date.now() - oldest) / DAY_MS)),
    oldest_pending_at: new Date(oldest).toISOString(),
  }
}

export function coverageMetadata(statusData: {
  total: number
  analyzed: number
  scores?: Array<DecayScore & { lastAnalyzedAt?: string }>
  queueItems?: Array<{ source_mtime?: string | null }>
}) {
  const analyzedCoverage = statusData.total === 0
    ? 0
    : Number(clamp(statusData.analyzed / statusData.total, 0, 1).toFixed(4))
  const analyzedAt = (statusData.scores ?? [])
    .map(score => score.lastAnalyzedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null
  const recentThroughput = (statusData.scores ?? []).filter(score => {
    if (!score.lastAnalyzedAt) return false
    const timestamp = Date.parse(score.lastAnalyzedAt)
    return !Number.isNaN(timestamp) && Date.now() - timestamp <= STALE_AFTER_DAYS * DAY_MS
  }).length

  return {
    as_of: new Date().toISOString(),
    last_analyzed_at: analyzedAt,
    analyzed_coverage: analyzedCoverage,
    oldest_pending_age: queueFreshness(statusData.queueItems ?? []).oldest_pending_age,
    recent_throughput: recentThroughput,
  }
}

export function releaseMetadata(
  env: Pick<NodeJS.ProcessEnv, 'RESEARCH_VAULT_NPM_LATEST_VERSION' | 'RESEARCH_VAULT_NPM_MODIFIED_AT' | 'RESEARCH_VAULT_PUBLIC_REPO_URL'>,
  packageJson: { name?: string; version?: string },
) {
  const npmLatestVersion = env.RESEARCH_VAULT_NPM_LATEST_VERSION ?? null
  const npmModifiedAt = env.RESEARCH_VAULT_NPM_MODIFIED_AT ?? null
  const publicRepo = env.RESEARCH_VAULT_PUBLIC_REPO_URL ?? null
  const modifiedVerdict = staleVerdict(npmModifiedAt)
  const provided = Boolean(npmLatestVersion && npmModifiedAt && publicRepo)

  return {
    package_name: packageJson.name ?? null,
    local_version: packageJson.version ?? null,
    npm_latest_version: npmLatestVersion,
    npm_modified_at: npmModifiedAt,
    days_since_npm_update: npmModifiedAt && !Number.isNaN(Date.parse(npmModifiedAt))
      ? Math.max(0, Math.floor((Date.now() - Date.parse(npmModifiedAt)) / DAY_MS))
      : null,
    public_repo: publicRepo,
    freshness_verdict: provided ? modifiedVerdict.verdict : 'FLAG' as FreshnessVerdict,
    freshness_reason: provided
      ? modifiedVerdict.reason
      : 'Release freshness was not provided by the runtime environment.',
  }
}
