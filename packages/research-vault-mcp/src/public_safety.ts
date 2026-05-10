export interface PublicSafetyScan {
  public_safe: boolean
  redacted: unknown
  reasons: string[]
}

const REDACTIONS = [
  {
    reason: 'local_home_path',
    marker: '[REDACTED_LOCAL_PATH]',
    pattern: /\/Users\/[^/\s]+\/[^"'`]+?(?=["'`])/g,
  },
  {
    reason: 'local_home_path',
    marker: '[REDACTED_LOCAL_PATH]',
    pattern: /\/Users\/[^/\s]+\/(?:[^/\s"'`),;]+(?: [^/\s"'`),;]+)*\/)*[^/\s"'`),;]+/g,
  },
  {
    reason: 'operator_command',
    marker: '[REDACTED_OPERATOR_COMMAND]',
    pattern: /(^|[\s;|&])(?:ssh|scp|rsync)\s+[^\n"'`]*/g,
    keepPrefix: true,
  },
  {
    reason: 'token',
    marker: '[REDACTED_TOKEN]',
    pattern: /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[A-Za-z0-9-]{12,})\b/g,
  },
  {
    reason: 'ipv4',
    marker: '[REDACTED_IPV4]',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasEnumerableEntries(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && Object.keys(value).length > 0
}

function redactStringWithReasons(input: string): { redacted: string; reasons: string[] } {
  const reasons = new Set<string>()
  let redacted = input

  for (const rule of REDACTIONS) {
    rule.pattern.lastIndex = 0
    redacted = redacted.replace(rule.pattern, (...match) => {
      reasons.add(rule.reason)
      if ('keepPrefix' in rule && rule.keepPrefix) {
        const prefix = String(match[1] || '')
        return `${prefix}${rule.marker}`
      }
      return rule.marker
    })
    rule.pattern.lastIndex = 0
  }

  return { redacted, reasons: [...reasons] }
}

export function redactUnsafeText(input: string): string {
  return redactStringWithReasons(input).redacted
}

export function sanitizePublicData<T>(value: T): T {
  if (typeof value === 'string') return redactUnsafeText(value) as T
  if (Array.isArray(value)) return value.map(item => sanitizePublicData(item)) as T
  if (!isPlainObject(value) && !hasEnumerableEntries(value)) return value

  const entries = Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    redactUnsafeText(key),
    sanitizePublicData(entry),
  ])
  return Object.fromEntries(entries) as T
}

function collectReasons(value: unknown, reasons: Set<string>): void {
  if (typeof value === 'string') {
    for (const reason of redactStringWithReasons(value).reasons) reasons.add(reason)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectReasons(item, reasons)
    return
  }

  if (!isPlainObject(value) && !hasEnumerableEntries(value)) return

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    collectReasons(key, reasons)
    collectReasons(entry, reasons)
  }
}

export function scanPublicSafety(value: unknown): PublicSafetyScan {
  const reasons = new Set<string>()
  collectReasons(value, reasons)

  return {
    public_safe: reasons.size === 0,
    redacted: sanitizePublicData(value),
    reasons: [...reasons],
  }
}
