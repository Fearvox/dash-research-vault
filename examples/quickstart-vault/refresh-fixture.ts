#!/usr/bin/env bun
// Rewrites .meta/decay-scores.json with timestamps relative to the current clock
// so the QUICKSTART's documented freshness_verdict: "PASS" holds for any clone date.
//
// staleVerdict in packages/research-vault-mcp/src/evidence_metadata.ts flags
// any lastAnalyzedAt older than 7 days. The shipped JSON carries placeholder
// dates for repo readability; this helper rewrites them to "recent" before
// the demo runs.
//
// Usage:
//   bun examples/quickstart-vault/refresh-fixture.ts
//   # or, after `chmod +x`:
//   ./examples/quickstart-vault/refresh-fixture.ts

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dayMs = 24 * 60 * 60 * 1000
const iso = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * dayMs).toISOString()

const scores = [
  {
    itemId: 'sample-conversation',
    score: 0.62,
    lastAccess: iso(3),
    lastAnalyzedAt: iso(2),
    accessCount: 7,
    summaryLevel: 'shallow',
    nextReviewAt: iso(-4),
    difficulty: 0.5,
  },
  {
    itemId: 'sample-trend',
    score: 0.91,
    lastAccess: iso(2),
    lastAnalyzedAt: iso(1),
    accessCount: 3,
    summaryLevel: 'deep',
    nextReviewAt: iso(-10),
    difficulty: 2.0,
  },
]

const target = join(here, '.meta', 'decay-scores.json')
writeFileSync(target, JSON.stringify(scores, null, 2) + '\n')

console.log(
  `Refreshed ${scores.length} entries in ${target}\n` +
  `lastAnalyzedAt now ${iso(2)} / ${iso(1)} — within the 7-day freshness window.`,
)
