// packages/research-vault-mcp/src/types.ts

export interface VaultEntry {
  id: string
  title: string
  category: string
  path: string
  modified: string
  size: number
}

export interface DecayScore {
  itemId: string
  score: number
  lastAccess: string
  accessCount: number
  summaryLevel: 'deep' | 'shallow' | 'none'
  nextReviewAt: string
  difficulty: number
}

// ─── Ingest Job Types ───────────────────────────────────────────

export type IngestStatus = 'queued' | 'fetching' | 'parsing' | 'done' | 'failed'

export interface IngestJob {
  jobId: string
  source: 'url' | 'file' | 'arxiv'
  value: string
  category: string
  status: IngestStatus
  rawPath: string | null
  metadata: ArxivMetadata | null
  error?: string
  createdAt: string
  updatedAt: string
}

export interface ArxivMetadata {
  title: string | null
  authors: string[] | null
  abstract: string | null
  arxivId: string | null
  categories: string[] | null
}

// ─── Tool Input/Output Types ───────────────────────────────────

export interface RawIngestInput {
  source: 'url' | 'file' | 'arxiv'
  value: string
  category?: string   // defaults to "inbox"
  priority?: 'high' | 'low'
  arxivMetadata?: boolean  // ArXiv only: prefetch metadata before storing, default true
}

export interface NoteSaveInput {
  title: string
  content: string
  category: string
  tags?: string[]
  summaryLevel?: 'deep' | 'shallow' | 'none'
}

export interface VaultGetInput {
  id: string
  include_content?: boolean
  max_chars?: number
}

export interface VaultDeleteInput {
  id?: string
  path?: string
}

// ─── Checksum Types ────────────────────────────────────────────

export type ChecksumStore = Record<string, { sha256: string; writtenAt: string }>
