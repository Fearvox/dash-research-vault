import { describe, test, expect, beforeEach } from 'bun:test'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TMP = join(tmpdir(), 'vault_jobs_test')

beforeEach(() => {
  try { rmSync(TMP, { recursive: true }) } catch {}
  mkdirSync(join(TMP, '.meta'), { recursive: true })
})

describe('IngestJobStore', () => {
  test('createJob returns a job with queued status', async () => {
    const { IngestJobStore } = await import('../src/vault_jobs.ts')
    const store = new IngestJobStore(TMP)
    const job = await store.createJob({ source: 'url', value: 'https://example.com', category: 'inbox' })
    expect(job.status).toBe('queued')
    expect(job.jobId).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('updateJob transitions status', async () => {
    const { IngestJobStore } = await import('../src/vault_jobs.ts')
    const store = new IngestJobStore(TMP)
    const job = await store.createJob({ source: 'arxiv', value: '2501.00001', category: 'inbox' })
    await store.updateJob(job.jobId, { status: 'fetching', rawPath: '/tmp/test.pdf' })
    const updated = await store.getJob(job.jobId)
    expect(updated!.status).toBe('fetching')
    expect(updated!.rawPath).toBe('/tmp/test.pdf')
  })

  test('computeChecksum returns sha256 of hello world', async () => {
    const { computeChecksum } = await import('../src/vault_jobs.ts')
    const { writeFileSync } = await import('fs')
    writeFileSync(join(TMP, 'test.txt'), 'hello world')
    const hash = await computeChecksum(join(TMP, 'test.txt'))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  test('verifyChecksum returns true for matching hash', async () => {
    const { computeChecksum, verifyChecksum } = await import('../src/vault_jobs.ts')
    const { writeFileSync } = await import('fs')
    writeFileSync(join(TMP, 'verify.txt'), 'test')
    const hash = await computeChecksum(join(TMP, 'verify.txt'))
    const ok = await verifyChecksum(join(TMP, 'verify.txt'), hash)
    expect(ok).toBe(true)
  })
})