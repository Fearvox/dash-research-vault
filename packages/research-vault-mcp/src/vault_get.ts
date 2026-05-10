import { readFileSync, statSync } from 'fs'
import { basename } from 'path'
import { passGuidance } from './guidance.ts'
import { errorEnvelope, okEnvelope } from './response.ts'
import type { VaultEntry, VaultGetInput } from './types.ts'

const DEFAULT_EXCERPT_CHARS = 1200
const HARD_MAX_CHARS = 12000

function fileStem(entry: VaultEntry): string {
  return basename(entry.path).replace(/\.md$/, '')
}

function sourceRef(entry: VaultEntry): string {
  return `vault://knowledge/${entry.category}/${entry.id}`
}

function requestedLimit(input: VaultGetInput): number {
  const fallback = input.include_content ? HARD_MAX_CHARS : DEFAULT_EXCERPT_CHARS
  const ceiling = input.include_content ? HARD_MAX_CHARS : DEFAULT_EXCERPT_CHARS
  const requested = input.max_chars === undefined
    ? fallback
    : Number.isFinite(input.max_chars)
      ? Math.max(0, Math.floor(input.max_chars))
      : fallback
  return Math.min(requested, ceiling)
}

function resolveEntry(
  id: string,
  entries: VaultEntry[],
): { entry?: VaultEntry; reason?: string } {
  const exact = entries.filter(entry => entry.id === id)
  if (exact.length === 1) return { entry: exact[0] }
  if (exact.length > 1) return { reason: 'Multiple Research Vault notes matched the requested id.' }

  const stemMatches = entries.filter(entry => fileStem(entry) === id)
  if (stemMatches.length === 1) return { entry: stemMatches[0] }
  if (stemMatches.length > 1) return { reason: 'Multiple Research Vault notes matched the requested file stem.' }

  return { reason: 'No Research Vault note matched the requested id.' }
}

export function getVaultEntry(
  input: VaultGetInput,
  entries: VaultEntry[],
) {
  const id = input.id?.trim()
  if (!id) {
    return {
      envelope: errorEnvelope(
        'vault_get requires a non-empty id.',
        'Call vault_search first, then retry vault_get with an exact id from the search results.',
        {},
      ),
      isError: true,
    }
  }

  const resolved = resolveEntry(id, entries)
  if (!resolved.entry) {
    return {
      envelope: errorEnvelope(
        resolved.reason ?? 'No Research Vault note matched the requested id.',
        'Call vault_search first, then retry vault_get with an exact id from the search results.',
        {},
      ),
      isError: true,
    }
  }

  const entry = resolved.entry
  const content = readFileSync(entry.path, 'utf-8')
  const stat = statSync(entry.path)
  const limit = requestedLimit(input)
  const body = content.slice(0, limit)
  const truncated = content.length > body.length
  const contentKind = input.include_content ? 'full' : 'excerpt'

  return {
    envelope: okEnvelope(
      {
        id: entry.id,
        title: entry.title,
        category: entry.category,
        source_ref: sourceRef(entry),
        content: body,
        content_kind: contentKind,
        truncated,
        chars_returned: body.length,
        total_chars: content.length,
        max_chars: limit,
        modified: stat.mtime.toISOString(),
        size: stat.size,
      },
      passGuidance(
        input.include_content
          ? 'Returned bounded note content from the Research Vault read surface.'
          : 'Returned a bounded excerpt from the Research Vault read surface.',
        truncated
          ? 'Use include_content with a larger max_chars only if this excerpt is insufficient.'
          : 'Use the returned public-safe note reference for follow-up.',
        truncated ? 'vault_get' : undefined,
      ),
      {},
    ),
    isError: false,
  }
}
