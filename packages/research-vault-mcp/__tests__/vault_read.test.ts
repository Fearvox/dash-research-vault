import { describe, expect, test } from 'bun:test'
import { normalizeDecayScoresStore } from '../src/vault.ts'

describe('vault read metadata', () => {
  test('normalizes legacy object-shaped decay score stores', () => {
    const scores = normalizeDecayScoresStore({
      'note-a': {
        itemId: 'note-a',
        score: 0.9,
        lastAccess: '2026-04-20T00:00:00.000Z',
        accessCount: 3,
        summaryLevel: 'deep',
        nextReviewAt: '2026-05-01T00:00:00.000Z',
        difficulty: 1,
      },
      'note-b': {
        itemId: 'note-b',
        score: 0.4,
        lastAccess: '2026-04-19T00:00:00.000Z',
        accessCount: 1,
        summaryLevel: 'shallow',
        nextReviewAt: '2026-04-25T00:00:00.000Z',
        difficulty: 2,
      },
    })

    expect(scores).toHaveLength(2)
    expect(scores.map(score => score.itemId).sort()).toEqual(['note-a', 'note-b'])
    expect(scores.find(score => score.itemId === 'note-a')).toMatchObject({
      score: 0.9,
      summaryLevel: 'deep',
      accessCount: 3,
    })
  })
})
