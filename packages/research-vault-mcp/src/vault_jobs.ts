import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { createHash, randomUUID } from 'crypto'
import type { IngestJob, RawIngestInput, ChecksumStore } from './types.js'

const JOBS_FILE = 'ingest-jobs.json'
const CHECKSUMS_FILE = 'checksums.json'

export class IngestJobStore {
  private metaDir: string

  constructor(private vaultRoot: string) {
    this.metaDir = join(this.vaultRoot, '.meta')
    if (!existsSync(this.metaDir)) mkdirSync(this.metaDir, { recursive: true })
  }

  private jobsPath() { return join(this.metaDir, JOBS_FILE) }
  private checksumsPath() { return join(this.metaDir, CHECKSUMS_FILE) }

  private loadJobs(): Record<string, IngestJob> {
    try {
      return JSON.parse(readFileSync(this.jobsPath(), 'utf-8'))
    } catch { return {} }
  }

  private saveJobs(jobs: Record<string, IngestJob>) {
    writeFileSync(this.jobsPath(), JSON.stringify(jobs, null, 2), 'utf-8')
  }

  private loadChecksums(): ChecksumStore {
    try {
      return JSON.parse(readFileSync(this.checksumsPath(), 'utf-8'))
    } catch { return {} }
  }

  private saveChecksums(store: ChecksumStore) {
    writeFileSync(this.checksumsPath(), JSON.stringify(store, null, 2), 'utf-8')
  }

  async createJob(input: RawIngestInput): Promise<IngestJob> {
    const jobs = this.loadJobs()
    const now = new Date().toISOString()
    const job: IngestJob = {
      jobId: randomUUID(),
      source: input.source,
      value: input.value,
      category: input.category ?? 'inbox',
      status: 'queued',
      rawPath: null,
      metadata: null,
      createdAt: now,
      updatedAt: now
    }
    jobs[job.jobId] = job
    this.saveJobs(jobs)
    return job
  }

  async getJob(jobId: string): Promise<IngestJob | null> {
    return this.loadJobs()[jobId] ?? null
  }

  async updateJob(jobId: string, updates: Partial<IngestJob>): Promise<IngestJob | null> {
    const jobs = this.loadJobs()
    const job = jobs[jobId]
    if (!job) return null
    jobs[jobId] = { ...job, ...updates, updatedAt: new Date().toISOString() }
    this.saveJobs(jobs)
    return jobs[jobId]
  }

  async getAllJobs(): Promise<IngestJob[]> {
    return Object.values(this.loadJobs())
  }
}

export async function computeChecksum(filePath: string): Promise<string> {
  const file = Bun.file(filePath)
  const buffer = await file.arrayBuffer()
  const hash = createHash('sha256')
  hash.update(Buffer.from(buffer))
  return hash.digest('hex')
}

export async function verifyChecksum(filePath: string, expected: string): Promise<boolean> {
  const actual = await computeChecksum(filePath)
  return actual === expected
}
