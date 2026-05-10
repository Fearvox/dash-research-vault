// @bun
var __require = import.meta.require;

// src/vault.ts
import { readFileSync as readFileSync2, readdirSync, existsSync, statSync as statSync2 } from "fs";
import { join, basename as basename2 } from "path";
import { homedir } from "os";

// src/vault_get.ts
import { readFileSync, statSync } from "fs";
import { basename } from "path";

// src/guidance.ts
function passGuidance(reason, next_step, recommended_tool) {
  return {
    verdict: "PASS",
    reason,
    next_step,
    recommended_tool,
    retryable: false
  };
}
function flagGuidance(reason, next_step, recommended_tool) {
  return {
    verdict: "FLAG",
    reason,
    next_step,
    recommended_tool,
    retryable: true
  };
}
function blockGuidance(reason, next_step, recommended_tool) {
  return {
    verdict: "BLOCK",
    reason,
    next_step,
    recommended_tool,
    retryable: false
  };
}
function readonlyBlockedGuidance(toolName, profile) {
  return blockGuidance(`${toolName} is unavailable while Research Vault MCP is running in ${profile} profile.`, "Use vault_search for readonly evidence, or switch to MCP_PROFILE=full for operator-approved non-destructive mutation in a private operator session.", "vault_search");
}
function adminBlockedGuidance(toolName, profile) {
  return blockGuidance(`${toolName} is admin-only and unavailable while Research Vault MCP is running in ${profile} profile.`, "Use vault_search for readonly evidence, or start a private admin operator session with MCP_PROFILE=admin; readonly/full profiles are insufficient for destructive/admin tools.", "vault_search");
}

// src/profile.ts
function getActiveProfile(env = process.env) {
  const raw = String(env.MCP_PROFILE || env.RESEARCH_VAULT_MCP_PROFILE || "readonly").toLowerCase();
  if (raw === "full" || raw === "admin" || raw === "readonly")
    return raw;
  return "readonly";
}
function profileAllowsMutation(profile) {
  return profile === "full" || profile === "admin";
}

// src/public_safety.ts
var REDACTIONS = [
  {
    reason: "local_home_path",
    marker: "[REDACTED_LOCAL_PATH]",
    pattern: /\/Users\/[^/\s]+\/[^"'`]+?(?=["'`])/g
  },
  {
    reason: "local_home_path",
    marker: "[REDACTED_LOCAL_PATH]",
    pattern: /\/Users\/[^/\s]+\/(?:[^/\s"'`),;]+(?: [^/\s"'`),;]+)*\/)*[^/\s"'`),;]+/g
  },
  {
    reason: "operator_command",
    marker: "[REDACTED_OPERATOR_COMMAND]",
    pattern: /(^|[\s;|&])(?:ssh|scp|rsync)\s+[^\n"'`]*/g,
    keepPrefix: true
  },
  {
    reason: "token",
    marker: "[REDACTED_TOKEN]",
    pattern: /\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|xox[A-Za-z0-9-]{12,})\b/g
  },
  {
    reason: "ipv4",
    marker: "[REDACTED_IPV4]",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
  }
];
function isPlainObject(value) {
  if (!value || typeof value !== "object")
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasEnumerableEntries(value) {
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}
function redactStringWithReasons(input) {
  const reasons = new Set;
  let redacted = input;
  for (const rule of REDACTIONS) {
    rule.pattern.lastIndex = 0;
    redacted = redacted.replace(rule.pattern, (...match) => {
      reasons.add(rule.reason);
      if ("keepPrefix" in rule && rule.keepPrefix) {
        const prefix = String(match[1] || "");
        return `${prefix}${rule.marker}`;
      }
      return rule.marker;
    });
    rule.pattern.lastIndex = 0;
  }
  return { redacted, reasons: [...reasons] };
}
function redactUnsafeText(input) {
  return redactStringWithReasons(input).redacted;
}
function sanitizePublicData(value) {
  if (typeof value === "string")
    return redactUnsafeText(value);
  if (Array.isArray(value))
    return value.map((item) => sanitizePublicData(item));
  if (!isPlainObject(value) && !hasEnumerableEntries(value))
    return value;
  const entries = Object.entries(value).map(([key, entry]) => [
    redactUnsafeText(key),
    sanitizePublicData(entry)
  ]);
  return Object.fromEntries(entries);
}
function collectReasons(value, reasons) {
  if (typeof value === "string") {
    for (const reason of redactStringWithReasons(value).reasons)
      reasons.add(reason);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      collectReasons(item, reasons);
    return;
  }
  if (!isPlainObject(value) && !hasEnumerableEntries(value))
    return;
  for (const [key, entry] of Object.entries(value)) {
    collectReasons(key, reasons);
    collectReasons(entry, reasons);
  }
}
function scanPublicSafety(value) {
  const reasons = new Set;
  collectReasons(value, reasons);
  return {
    public_safe: reasons.size === 0,
    redacted: sanitizePublicData(value),
    reasons: [...reasons]
  };
}

// src/response.ts
function buildEvidence(evidence = {}, public_safe = true, safety_reasons) {
  return {
    ...evidence,
    as_of: evidence.as_of || new Date().toISOString(),
    profile: evidence.profile || getActiveProfile(),
    public_safe,
    safety_reasons: safety_reasons || evidence.safety_reasons
  };
}
function okEnvelope(data, guidance = passGuidance("Request completed.", "Use the returned evidence."), evidence = {}) {
  const scan = scanPublicSafety(data);
  const sanitized = sanitizePublicData(data);
  if (!scan.public_safe) {
    return {
      ok: false,
      data: sanitized,
      agent_guidance: blockGuidance("Public-surface leak candidates were redacted from the tool response.", "Use a private diagnostic profile or sanitize the source data before sharing this result."),
      evidence: buildEvidence(evidence, false, scan.reasons)
    };
  }
  return {
    ok: true,
    data: sanitized,
    agent_guidance: guidance,
    evidence: buildEvidence(evidence, true)
  };
}
function errorEnvelope(reason, next_step, evidence = {}) {
  return {
    ok: false,
    data: null,
    agent_guidance: blockGuidance(reason, next_step),
    evidence: buildEvidence(evidence, evidence.public_safe ?? true, evidence.safety_reasons)
  };
}

// src/vault_get.ts
var DEFAULT_EXCERPT_CHARS = 1200;
var HARD_MAX_CHARS = 12000;
function fileStem(entry) {
  return basename(entry.path).replace(/\.md$/, "");
}
function sourceRef(entry) {
  return `vault://knowledge/${entry.category}/${entry.id}`;
}
function requestedLimit(input) {
  const fallback = input.include_content ? HARD_MAX_CHARS : DEFAULT_EXCERPT_CHARS;
  const ceiling = input.include_content ? HARD_MAX_CHARS : DEFAULT_EXCERPT_CHARS;
  const requested = input.max_chars === undefined ? fallback : Number.isFinite(input.max_chars) ? Math.max(0, Math.floor(input.max_chars)) : fallback;
  return Math.min(requested, ceiling);
}
function resolveEntry(id, entries) {
  const exact = entries.filter((entry) => entry.id === id);
  if (exact.length === 1)
    return { entry: exact[0] };
  if (exact.length > 1)
    return { reason: "Multiple Research Vault notes matched the requested id." };
  const stemMatches = entries.filter((entry) => fileStem(entry) === id);
  if (stemMatches.length === 1)
    return { entry: stemMatches[0] };
  if (stemMatches.length > 1)
    return { reason: "Multiple Research Vault notes matched the requested file stem." };
  return { reason: "No Research Vault note matched the requested id." };
}
function getVaultEntry(input, entries) {
  const id = input.id?.trim();
  if (!id) {
    return {
      envelope: errorEnvelope("vault_get requires a non-empty id.", "Call vault_search first, then retry vault_get with an exact id from the search results.", {}),
      isError: true
    };
  }
  const resolved = resolveEntry(id, entries);
  if (!resolved.entry) {
    return {
      envelope: errorEnvelope(resolved.reason ?? "No Research Vault note matched the requested id.", "Call vault_search first, then retry vault_get with an exact id from the search results.", {}),
      isError: true
    };
  }
  const entry = resolved.entry;
  const content = readFileSync(entry.path, "utf-8");
  const stat = statSync(entry.path);
  const limit = requestedLimit(input);
  const body = content.slice(0, limit);
  const truncated = content.length > body.length;
  const contentKind = input.include_content ? "full" : "excerpt";
  return {
    envelope: okEnvelope({
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
      size: stat.size
    }, passGuidance(input.include_content ? "Returned bounded note content from the Research Vault read surface." : "Returned a bounded excerpt from the Research Vault read surface.", truncated ? "Use include_content with a larger max_chars only if this excerpt is insufficient." : "Use the returned public-safe note reference for follow-up.", truncated ? "vault_get" : undefined), {}),
    isError: false
  };
}

// src/evidence_metadata.ts
var STALE_AFTER_DAYS = 7;
var DAY_MS = 24 * 60 * 60 * 1000;
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function lower(value) {
  return (value ?? "").toLowerCase();
}
function queryTerms(query) {
  return lower(query).split(/\s+/).map((term) => term.trim()).filter(Boolean);
}
function includesQuery(value, query) {
  const terms = queryTerms(query);
  if (terms.length === 0)
    return false;
  const haystack = lower(value);
  return terms.some((term) => haystack.includes(term));
}
function matchedFields(entry, query) {
  if (!query?.trim())
    return [];
  const candidates = [
    ["title", entry.title],
    ["content", entry.content],
    ["id", entry.id],
    ["category", entry.category]
  ];
  return candidates.filter(([, value]) => includesQuery(value, query)).map(([field]) => field);
}
function whyMatched(entry, query, fields) {
  if (!query?.trim())
    return "No query provided; result is included by category or default listing.";
  if (fields.length === 0)
    return "Result is included after filters; no direct field match was detected.";
  const labels = fields.map((field) => {
    if (field === "title")
      return "title";
    if (field === "content")
      return "note content";
    if (field === "category")
      return "category";
    return field;
  });
  return `Matched query "${query}" in ${labels.join(", ")}.`;
}
function snippetFromContent(content, query, maxChars = 240) {
  const limit = Math.max(0, Math.floor(maxChars));
  if (limit === 0)
    return "";
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit)
    return normalized;
  const terms = queryTerms(query);
  const lowerContent = lower(normalized);
  const hitIndex = terms.map((term) => lowerContent.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (hitIndex === undefined)
    return normalized.slice(0, limit).trimEnd();
  const halfWindow = Math.floor(limit / 2);
  const start = Math.max(0, Math.min(hitIndex - halfWindow, normalized.length - limit));
  const end = Math.min(normalized.length, start + limit);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  const available = Math.max(0, limit - prefix.length - suffix.length);
  return `${prefix}${normalized.slice(start, start + available).trim()}${suffix}`;
}
function staleVerdict(lastAnalyzedAt) {
  if (!lastAnalyzedAt) {
    return { verdict: "FLAG", reason: "No analysis timestamp was provided." };
  }
  const timestamp = Date.parse(lastAnalyzedAt);
  if (Number.isNaN(timestamp)) {
    return { verdict: "FLAG", reason: "Analysis timestamp could not be parsed." };
  }
  const ageDays = Math.floor((Date.now() - timestamp) / DAY_MS);
  if (ageDays > STALE_AFTER_DAYS) {
    return { verdict: "FLAG", reason: `Analysis is ${ageDays} days old.` };
  }
  return { verdict: "PASS", reason: "Analysis is fresh enough for the read surface." };
}
function itemFreshness(entry) {
  const lastAnalyzedAt = entry.score?.lastAnalyzedAt ?? null;
  const verdict = staleVerdict(lastAnalyzedAt);
  return {
    last_analyzed_at: lastAnalyzedAt,
    source_mtime: entry.modified || null,
    freshness_verdict: verdict.verdict,
    freshness_reason: verdict.reason
  };
}
function queueFreshness(queueItems) {
  const timestamps = queueItems.map((item) => item.source_mtime ? Date.parse(item.source_mtime) : NaN).filter((timestamp) => !Number.isNaN(timestamp));
  if (timestamps.length === 0) {
    return {
      oldest_pending_age: null,
      oldest_pending_at: null
    };
  }
  const oldest = Math.min(...timestamps);
  return {
    oldest_pending_age: Math.max(0, Math.floor((Date.now() - oldest) / DAY_MS)),
    oldest_pending_at: new Date(oldest).toISOString()
  };
}
function coverageMetadata(statusData) {
  const analyzedCoverage = statusData.total === 0 ? 0 : Number(clamp(statusData.analyzed / statusData.total, 0, 1).toFixed(4));
  const analyzedAt = (statusData.scores ?? []).map((score) => score.lastAnalyzedAt).filter((value) => Boolean(value)).sort().at(-1) ?? null;
  const recentThroughput = (statusData.scores ?? []).filter((score) => {
    if (!score.lastAnalyzedAt)
      return false;
    const timestamp = Date.parse(score.lastAnalyzedAt);
    return !Number.isNaN(timestamp) && Date.now() - timestamp <= STALE_AFTER_DAYS * DAY_MS;
  }).length;
  return {
    as_of: new Date().toISOString(),
    last_analyzed_at: analyzedAt,
    analyzed_coverage: analyzedCoverage,
    oldest_pending_age: queueFreshness(statusData.queueItems ?? []).oldest_pending_age,
    recent_throughput: recentThroughput
  };
}
function releaseMetadata(env, packageJson) {
  const npmLatestVersion = env.RESEARCH_VAULT_NPM_LATEST_VERSION ?? null;
  const npmModifiedAt = env.RESEARCH_VAULT_NPM_MODIFIED_AT ?? null;
  const publicRepo = env.RESEARCH_VAULT_PUBLIC_REPO_URL ?? null;
  const modifiedVerdict = staleVerdict(npmModifiedAt);
  const provided = Boolean(npmLatestVersion && npmModifiedAt && publicRepo);
  return {
    package_name: packageJson.name ?? null,
    local_version: packageJson.version ?? null,
    npm_latest_version: npmLatestVersion,
    npm_modified_at: npmModifiedAt,
    days_since_npm_update: npmModifiedAt && !Number.isNaN(Date.parse(npmModifiedAt)) ? Math.max(0, Math.floor((Date.now() - Date.parse(npmModifiedAt)) / DAY_MS)) : null,
    public_repo: publicRepo,
    freshness_verdict: provided ? modifiedVerdict.verdict : "FLAG",
    freshness_reason: provided ? modifiedVerdict.reason : "Release freshness was not provided by the runtime environment."
  };
}

// src/vault.ts
var DEFAULT_VAULT_ROOT = `${homedir()}/Documents/Evensong/research-vault`;
function getVaultRoot() {
  return process.env.VAULT_ROOT ?? DEFAULT_VAULT_ROOT;
}
function getKnowledgeDir() {
  return join(getVaultRoot(), "knowledge");
}
function getRawDir() {
  return join(getVaultRoot(), "raw");
}
function getDecayPath() {
  return join(getVaultRoot(), ".meta", "decay-scores.json");
}
function getTaxonomyPath() {
  return join(getVaultRoot(), "knowledge", "_taxonomy.md");
}
function getPackageJson() {
  try {
    return JSON.parse(readFileSync2(new URL("../package.json", import.meta.url), "utf-8"));
  } catch {
    return {};
  }
}
function normalizeId(raw) {
  return raw.replace(/^\d{8}--?\d{4}-/, "").replace(/^(\d{10,})--?/, "").replace(/\.md$/, "");
}
function normalizeDecayScoresStore(parsed) {
  if (Array.isArray(parsed))
    return parsed;
  if (parsed && typeof parsed === "object")
    return Object.values(parsed);
  return [];
}
function loadDecayScores() {
  try {
    const parsed = JSON.parse(readFileSync2(getDecayPath(), "utf-8"));
    return normalizeDecayScoresStore(parsed);
  } catch {
    return [];
  }
}
function loadTaxonomy() {
  try {
    return readFileSync2(getTaxonomyPath(), "utf-8");
  } catch {
    return "";
  }
}
function loadFileMeta(filePath) {
  try {
    const content = readFileSync2(filePath, "utf-8");
    const lines = content.split(`
`);
    let title = "";
    for (const line of lines.slice(0, 30)) {
      const m = line.match(/^#\s+(.+)/);
      if (m) {
        title = m[1];
        break;
      }
    }
    const s = statSync2(filePath);
    return {
      title: title || normalizeId(basename2(filePath)),
      modified: s.mtime.toISOString(),
      size: s.size
    };
  } catch {
    return { title: normalizeId(basename2(filePath)), modified: "", size: 0 };
  }
}
function scanKnowledge() {
  const entries = [];
  const knowledgeDir = getKnowledgeDir();
  if (!existsSync(knowledgeDir))
    return entries;
  const categories = readdirSync(knowledgeDir);
  for (const cat of categories) {
    if (cat.startsWith("_"))
      continue;
    const catPath = join(knowledgeDir, cat);
    if (!existsSync(catPath) || !statSync2(catPath).isDirectory())
      continue;
    const subEntries = readdirSync(catPath);
    for (const sub of subEntries) {
      const subPath = join(catPath, sub);
      const subStat = statSync2(subPath);
      if (subStat.isDirectory()) {
        const files = readdirSync(subPath).filter((f) => f.endsWith(".md"));
        for (const file of files) {
          const fp = join(subPath, file);
          const meta = loadFileMeta(fp);
          entries.push({
            id: normalizeId(file),
            title: meta.title,
            category: `${cat}/${sub}`,
            path: fp,
            modified: meta.modified,
            size: meta.size
          });
        }
      } else if (sub.endsWith(".md")) {
        const meta = loadFileMeta(subPath);
        entries.push({
          id: normalizeId(sub),
          title: meta.title,
          category: cat,
          path: subPath,
          modified: meta.modified,
          size: meta.size
        });
      }
    }
  }
  return entries;
}
function scanRaw() {
  const pending = [];
  const rawDir = getRawDir();
  if (!existsSync(rawDir))
    return pending;
  try {
    const entries = readdirSync(rawDir);
    for (const entry of entries) {
      if (entry === "_inbox") {
        const inbox = join(rawDir, entry);
        if (existsSync(inbox)) {
          pending.push(...readdirSync(inbox).filter((f) => /\.(md|pdf|txt)$/.test(f)));
        }
      } else if (/^\d{4}-\d{2}$/.test(entry)) {
        const monthDir = join(rawDir, entry);
        if (existsSync(monthDir)) {
          pending.push(...readdirSync(monthDir).filter((f) => /\.(md|pdf|txt)$/.test(f)).map((f) => `${entry}/${f}`));
        }
      }
    }
  } catch {}
  return pending;
}
function scanRawQueueItems() {
  const rawDir = getRawDir();
  return scanRaw().map((item) => {
    let filePath = join(rawDir, item);
    if (!existsSync(filePath))
      filePath = join(rawDir, "_inbox", item);
    let sourceMtime = null;
    try {
      sourceMtime = statSync2(filePath).mtime.toISOString();
    } catch {}
    const title = normalizeId(basename2(item)).replace(/\.[^.]+$/, "");
    return {
      id: normalizeId(basename2(item)).replace(/\.[^.]+$/, ""),
      title,
      source_mtime: sourceMtime
    };
  });
}
function entryScoreAliases(entry) {
  const stem = basename2(entry.path).replace(/\.md$/, "");
  const aliases = new Set([
    entry.id,
    stem,
    normalizeId(entry.id),
    normalizeId(stem),
    entry.id.replace(/--/g, "-"),
    stem.replace(/--/g, "-")
  ]);
  const datePrefixed = stem.match(/^\d{8}--(.+)$/);
  if (datePrefixed)
    aliases.add(datePrefixed[1]);
  return aliases;
}
function scoreAliases(score) {
  return new Set([
    score.itemId,
    normalizeId(score.itemId),
    score.itemId.replace(/--/g, "-")
  ]);
}
function scoreMatchesEntry(score, entry) {
  const entryAliases = entryScoreAliases(entry);
  return [...scoreAliases(score)].some((alias) => entryAliases.has(alias));
}
function matchedScoresForEntries(scores, entries) {
  return scores.filter((score) => entries.some((entry) => scoreMatchesEntry(score, entry)));
}
function pendingRawQueueItems(entries) {
  const analyzedIds = new Set(entries.flatMap((entry) => [...entryScoreAliases(entry)]));
  return scanRawQueueItems().filter((item) => !analyzedIds.has(normalizeId(item.id)));
}
function sourceRef2(entry) {
  return `vault://knowledge/${entry.category}/${entry.id}`;
}
function readEntryContent(entry) {
  try {
    return readFileSync2(entry.path, "utf-8");
  } catch {
    return "";
  }
}
function scoreForEntry(scoreMap, item) {
  return [...entryScoreAliases(item)].map((alias) => scoreMap.get(alias)).find(Boolean);
}
var vaultTools = [
  {
    name: "vault_get",
    description: "Read a bounded public-safe excerpt or capped content from a Research Vault note by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Research Vault note id returned by vault_search" },
        include_content: { type: "boolean", description: "Return capped content instead of the default excerpt" },
        max_chars: { type: "number", description: "Maximum returned content characters, capped at 12000" }
      },
      required: ["id"]
    },
    call: async (args) => {
      const result = getVaultEntry(args, scanKnowledge());
      return {
        content: [{ type: "text", text: JSON.stringify(result.envelope, null, 2) }],
        ...result.isError ? { isError: true } : {}
      };
    }
  },
  {
    name: "vault_search",
    description: "Search the Research Vault knowledge base. Returns analyzed papers with retention scores.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (matches title, content, id, and category)" },
        category: { type: "string", description: 'Filter by category (e.g., "ai-agents/benchmarking")' },
        limit: { type: "number", description: "Max results (default 10)" }
      }
    },
    call: async ({ query, category, limit = 10 }) => {
      let items = scanKnowledge();
      const scores = loadDecayScores();
      const scoreMap = new Map(scores.flatMap((s) => [...scoreAliases(s)].map((alias) => [alias, s])));
      if (category) {
        items = items.filter((item) => item.category === category || item.category.startsWith(category + "/"));
      }
      if (query) {
        items = items.filter((item) => {
          const content = readEntryContent(item);
          return matchedFields({ ...item, content }, query).length > 0;
        });
      }
      const results = items.slice(0, limit).map((item) => {
        const content = readEntryContent(item);
        const score = scoreForEntry(scoreMap, item);
        const fields = matchedFields({ ...item, content }, query);
        const freshness = itemFreshness({ ...item, score });
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
          source_ref: sourceRef2(item),
          section_anchor: undefined,
          canonical_group: undefined,
          ...freshness
        };
      });
      const hasStale = results.some((result) => result.freshness_verdict === "FLAG");
      const envelope = okEnvelope({ query, category, results, total: results.length }, hasStale ? flagGuidance("Search completed, but one or more results lack fresh analysis metadata.", "Use source_ref for readonly follow-up and refresh analysis metadata in the operator lane if needed.", "vault_get") : passGuidance("Search completed with provenance and freshness metadata.", "Use source_ref or vault_get for bounded follow-up evidence.", "vault_get"), {
        freshness: hasStale ? "Some search results are missing or stale analysis timestamps." : "Search result analysis metadata is fresh.",
        provenance: "vault_search result source_ref values are vault:// references without local paths."
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(envelope, null, 2)
        }]
      };
    }
  },
  {
    name: "vault_status",
    description: "Get Research Vault health \u2014 item counts by decay level, top/bottom retention.",
    inputSchema: { type: "object", properties: {} },
    call: async () => {
      const scores = loadDecayScores();
      const entries = scanKnowledge();
      const matchedScores = matchedScoresForEntries(scores, entries);
      const deep = matchedScores.filter((s) => s.summaryLevel === "deep");
      const shallow = matchedScores.filter((s) => s.summaryLevel === "shallow");
      const none = matchedScores.filter((s) => s.summaryLevel === "none");
      const sorted = [...matchedScores].sort((a, b) => b.score - a.score);
      const queueItems = pendingRawQueueItems(entries);
      const coverage = coverageMetadata({
        total: entries.length,
        analyzed: matchedScores.length,
        scores: matchedScores,
        queueItems
      });
      const release = releaseMetadata(process.env, getPackageJson());
      const top5 = sorted.slice(0, 5).map((s) => {
        const sid = s.itemId.replace(/--/g, "-");
        const entry = entries.find((e) => normalizeId(e.id) === normalizeId(s.itemId) || normalizeId(e.id) === normalizeId(sid));
        return { itemId: s.itemId, score: s.score, accesses: s.accessCount, title: entry?.title || s.itemId };
      });
      const bottom5 = sorted.slice(-5).reverse().map((s) => {
        const sid = s.itemId.replace(/--/g, "-");
        const entry = entries.find((e) => normalizeId(e.id) === normalizeId(s.itemId) || normalizeId(e.id) === normalizeId(sid));
        return { itemId: s.itemId, score: s.score, lastAccess: s.lastAccess.slice(0, 10), title: entry?.title || s.itemId };
      });
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
        release
      };
      const releaseFlag = release.freshness_verdict === "FLAG";
      const analysisFlag = staleVerdict(coverage.last_analyzed_at).verdict === "FLAG";
      const envelope = okEnvelope(statusData, releaseFlag || analysisFlag ? flagGuidance(releaseFlag ? "Vault status is available, but release freshness was not fully provided by the runtime environment." : "Vault status is available, but analysis freshness is stale or missing.", releaseFlag ? "Set RESEARCH_VAULT_NPM_LATEST_VERSION, RESEARCH_VAULT_NPM_MODIFIED_AT, and RESEARCH_VAULT_PUBLIC_REPO_URL in the runtime environment." : "Run the operator analysis lane before relying on freshness-sensitive claims.") : passGuidance("Vault status includes coverage, queue freshness, and release metadata.", "Use pending_raw and oldest_pending_age to decide whether operator analysis is needed."), {
        as_of: coverage.as_of,
        freshness: analysisFlag ? "Analysis freshness is stale or missing." : "Analysis freshness is within the accepted window.",
        release: release.freshness_verdict
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(envelope, null, 2)
        }]
      };
    }
  },
  {
    name: "vault_batch_analyze",
    description: "Check batch analyze status and pending papers in the raw queue.",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Preview N papers (default 5)" }
      }
    },
    call: async ({ count = 5 } = {}) => {
      const entries = scanKnowledge();
      const unanalyzed = pendingRawQueueItems(entries);
      const freshness = queueFreshness(unanalyzed);
      if (unanalyzed.length === 0) {
        const envelope2 = okEnvelope({
          message: "Queue empty; all visible raw papers are analyzed.",
          analyzed: entries.length,
          pending: 0,
          preview: [],
          oldest_pending_age: null,
          next_action: "none"
        }, passGuidance("Batch analysis queue is empty.", "No operator batch analysis action is needed."));
        return { content: [{ type: "text", text: JSON.stringify(envelope2, null, 2) }] };
      }
      const envelope = okEnvelope({
        message: `${unanalyzed.length} papers pending analysis`,
        pending: unanalyzed.length,
        preview: unanalyzed.slice(0, count).map((item) => ({
          id: item.id,
          title: item.title
        })),
        oldest_pending_age: freshness.oldest_pending_age,
        oldest_pending_at: freshness.oldest_pending_at,
        next_action: "operator_run_batch_analysis"
      }, flagGuidance("Raw queue has pending items that require operator-side batch analysis.", "Run the private operator batch analysis lane; this public response intentionally omits shell commands and local paths."), {
        freshness: freshness.oldest_pending_age === null ? "Pending queue age could not be calculated." : `Oldest pending item is ${freshness.oldest_pending_age} days old.`,
        provenance: "Queue preview exposes ids and titles only."
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(envelope, null, 2)
        }]
      };
    }
  },
  {
    name: "vault_taxonomy",
    description: "Get the Research Vault taxonomy \u2014 all categories and counts.",
    inputSchema: { type: "object", properties: {} },
    call: async () => {
      const taxonomy = loadTaxonomy();
      const entries = scanKnowledge();
      const catCounts = {};
      for (const e of entries)
        catCounts[e.category] = (catCounts[e.category] || 0) + 1;
      const envelope = okEnvelope({ taxonomy, categories: catCounts }, passGuidance("Taxonomy loaded with public-safe evidence metadata.", "Use category counts for readonly routing and vault_search for bounded follow-up evidence.", "vault_search"), {
        provenance: "Taxonomy response is sanitized through the public-safe envelope before serialization."
      });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(envelope, null, 2)
        }]
      };
    }
  }
];

// src/vault_write.ts
import { readFileSync as readFileSync4, writeFileSync as writeFileSync2, existsSync as existsSync3, mkdirSync as mkdirSync2, unlinkSync, realpathSync } from "fs";
import { join as join3, dirname, basename as basename3, resolve as pathResolve } from "path";
import { homedir as homedir2 } from "os";

// src/vault_jobs.ts
import { readFileSync as readFileSync3, writeFileSync, existsSync as existsSync2, mkdirSync } from "fs";
import { join as join2 } from "path";
import { createHash, randomUUID } from "crypto";
var JOBS_FILE = "ingest-jobs.json";
var CHECKSUMS_FILE = "checksums.json";

class IngestJobStore {
  vaultRoot;
  metaDir;
  constructor(vaultRoot) {
    this.vaultRoot = vaultRoot;
    this.metaDir = join2(this.vaultRoot, ".meta");
    if (!existsSync2(this.metaDir))
      mkdirSync(this.metaDir, { recursive: true });
  }
  jobsPath() {
    return join2(this.metaDir, JOBS_FILE);
  }
  checksumsPath() {
    return join2(this.metaDir, CHECKSUMS_FILE);
  }
  loadJobs() {
    try {
      return JSON.parse(readFileSync3(this.jobsPath(), "utf-8"));
    } catch {
      return {};
    }
  }
  saveJobs(jobs) {
    writeFileSync(this.jobsPath(), JSON.stringify(jobs, null, 2), "utf-8");
  }
  loadChecksums() {
    try {
      return JSON.parse(readFileSync3(this.checksumsPath(), "utf-8"));
    } catch {
      return {};
    }
  }
  saveChecksums(store) {
    writeFileSync(this.checksumsPath(), JSON.stringify(store, null, 2), "utf-8");
  }
  async createJob(input) {
    const jobs = this.loadJobs();
    const now = new Date().toISOString();
    const job = {
      jobId: randomUUID(),
      source: input.source,
      value: input.value,
      category: input.category ?? "inbox",
      status: "queued",
      rawPath: null,
      metadata: null,
      createdAt: now,
      updatedAt: now
    };
    jobs[job.jobId] = job;
    this.saveJobs(jobs);
    return job;
  }
  async getJob(jobId) {
    return this.loadJobs()[jobId] ?? null;
  }
  async updateJob(jobId, updates) {
    const jobs = this.loadJobs();
    const job = jobs[jobId];
    if (!job)
      return null;
    jobs[jobId] = { ...job, ...updates, updatedAt: new Date().toISOString() };
    this.saveJobs(jobs);
    return jobs[jobId];
  }
  async getAllJobs() {
    return Object.values(this.loadJobs());
  }
}
async function computeChecksum(filePath) {
  const file = Bun.file(filePath);
  const buffer = await file.arrayBuffer();
  const hash = createHash("sha256");
  hash.update(Buffer.from(buffer));
  return hash.digest("hex");
}

// src/ingest/arxiv.ts
var ARXIV_API = "https://export.arxiv.org/api/query";
function parseArxivId(value) {
  if (/^\d{4}\.\d{4,}(v\d+)?$/.test(value.trim())) {
    return value.trim();
  }
  const m = value.match(/(?:arxiv\.org\/abs\/|abs\/?)(\d{4}\.\d{4,}(?:v\d+)?)/i);
  return m ? m[1] : null;
}
async function fetchArxivMetadata(id) {
  const url = `${ARXIV_API}?id_list=${id}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`ArXiv API error: ${res.status}`);
  const xml = await res.text();
  return parseArxivXml(xml);
}
function parseArxivXml(xml) {
  const titleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : null;
  const summaryMatch = xml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
  const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, " ").trim() : null;
  const authors = [];
  const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
  let m;
  while ((m = authorRe.exec(xml)) !== null) {
    authors.push(m[1].replace(/\s+/g, " ").trim());
  }
  const categories = [];
  const catRe = /<category[^>]*term="([^"]+)"/gi;
  while ((m = catRe.exec(xml)) !== null)
    categories.push(m[1]);
  return {
    title,
    authors: authors.length ? authors : null,
    abstract,
    arxivId: null,
    categories: categories.length ? categories : null
  };
}

// src/ingest/html.ts
async function defaultLookup(hostname) {
  const { lookup } = await import("dns/promises");
  return lookup(hostname, { all: true });
}
var dnsLookup = defaultLookup;
function validateUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  const scheme = parsed.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw new Error(`URL scheme not allowed: ${scheme}. Only http/https permitted.`);
  }
  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  validateHostnameLiteralPolicy(hostname);
  if (hostname.includes(":")) {
    validateIpv6(hostname, hostname);
    return;
  }
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    validateIpv4(hostname, hostname);
    return;
  }
}
function validateHostnameLiteralPolicy(hostname) {
  if (hostname === "localhost" || hostname === "metadata.google.internal") {
    throw new Error(`Hostname not permitted: ${hostname}`);
  }
}
function validateIpv4(ip, originalHostname) {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    throw new Error(`Invalid IPv4 address: ${originalHostname}`);
  }
  const [a, b] = parts;
  if (a === 0)
    throw new Error(`Reserved IP blocked: ${originalHostname}`);
  if (a === 10)
    throw new Error(`Private IP blocked: ${originalHostname}`);
  if (a === 127)
    throw new Error(`Loopback IP blocked: ${originalHostname}`);
  if (a === 169 && b === 254 && parts[2] === 169 && parts[3] === 254) {
    throw new Error(`Cloud metadata endpoint blocked: ${originalHostname}`);
  }
  if (a === 169 && b === 254)
    throw new Error(`Link-local IP blocked: ${originalHostname}`);
  if (a === 172 && b >= 16 && b <= 31)
    throw new Error(`Private IP blocked: ${originalHostname}`);
  if (a === 192 && b === 168)
    throw new Error(`Private IP blocked: ${originalHostname}`);
}
function validateIpv6(ip, originalHostname) {
  const stripped = ip.toLowerCase().split("%")[0];
  if (stripped === "::1" || stripped === "::") {
    throw new Error(`IPv6 loopback/unspecified blocked: ${originalHostname}`);
  }
  if (/^(fc|fd)[0-9a-f]{0,2}:/i.test(stripped)) {
    throw new Error(`IPv6 unique-local blocked: ${originalHostname}`);
  }
  if (/^fe[89ab][0-9a-f]?:/i.test(stripped)) {
    throw new Error(`IPv6 link-local blocked: ${originalHostname}`);
  }
  const mappedV4 = stripped.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4) {
    validateIpv4(mappedV4[1], originalHostname);
  }
}
async function validateHostDns(hostname) {
  const stripped = hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  validateHostnameLiteralPolicy(stripped);
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(stripped))
    return;
  if (stripped.includes(":"))
    return;
  let resolved;
  try {
    resolved = await dnsLookup(stripped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`DNS lookup failed for ${hostname}: ${msg}`);
  }
  if (!resolved || resolved.length === 0) {
    throw new Error(`DNS lookup returned no records for ${hostname}`);
  }
  for (const { address, family } of resolved) {
    if (family === 4)
      validateIpv4(address, hostname);
    else if (family === 6)
      validateIpv6(address, hostname);
  }
}
var MAX_REDIRECTS = 5;
async function safeFetch(url, init = {}) {
  let currentUrl = url;
  for (let hop = 0;hop <= MAX_REDIRECTS; hop++) {
    validateUrl(currentUrl);
    const parsed = new URL(currentUrl);
    const hostname = parsed.hostname.replace(/^\[(.*)\]$/, "$1");
    await validateHostDns(hostname);
    const res = await fetch(currentUrl, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) {
      return res;
    }
    const location = res.headers.get("location");
    if (!location) {
      return res;
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`);
}
async function fetchHtml(url) {
  const res = await safeFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 research-vault-mcp/1.1.0",
      Accept: "text/html"
    }
  });
  if (!res.ok)
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<nav[\s\S]*?<\/nav>/gi, "").replace(/<footer[\s\S]*?<\/footer>/gi, "").replace(/<header[\s\S]*?<\/header>/gi, "").replace(/<aside[\s\S]*?<\/aside>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, `
`);
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, `

`).trim();
  return text;
}

// src/vault_write.ts
var DEFAULT_VAULT_ROOT2 = `${homedir2()}/Documents/Evensong/research-vault`;
function getVaultRoot2() {
  return process.env.VAULT_ROOT ?? DEFAULT_VAULT_ROOT2;
}
function getKnowledgeDir2() {
  return join3(getVaultRoot2(), "knowledge");
}
function getRawDir2() {
  return join3(getVaultRoot2(), "raw");
}
function getDecayPath2() {
  return join3(getVaultRoot2(), ".meta", "decay-scores.json");
}
function getChecksumsPath() {
  return join3(getVaultRoot2(), ".meta", "checksums.json");
}
function ensureDir(p) {
  if (!existsSync3(p))
    mkdirSync2(p, { recursive: true });
}
function safePath(root, target) {
  const joined = join3(root, target);
  let resolvedRoot;
  try {
    resolvedRoot = realpathSync(root);
  } catch {
    resolvedRoot = pathResolve(root);
  }
  let resolved;
  try {
    resolved = realpathSync(joined);
  } catch {
    resolved = pathResolve(resolvedRoot, target);
  }
  const rootNorm = resolvedRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const resolvedNorm = resolved.replace(/\\/g, "/").replace(/\/$/, "");
  if (!resolvedNorm.startsWith(rootNorm + "/") && resolvedNorm !== rootNorm) {
    throw new Error("Path traversal detected: target outside vault root");
  }
  return resolved;
}
function normalizeId2(raw) {
  return raw.replace(/^\d{8}--?\d{4}-/, "").replace(/^(\d{10,})--?/, "").replace(/\.md$/, "");
}
function loadDecayScores2() {
  try {
    const data = JSON.parse(readFileSync4(getDecayPath2(), "utf-8"));
    if (Array.isArray(data))
      return data;
    if (data && typeof data === "object")
      return Object.values(data);
    return [];
  } catch {
    return [];
  }
}
function saveDecayScores(scores) {
  const decayPath = getDecayPath2();
  ensureDir(dirname(decayPath));
  writeFileSync2(decayPath, JSON.stringify(scores, null, 2), "utf-8");
}
function loadChecksums() {
  try {
    return JSON.parse(readFileSync4(getChecksumsPath(), "utf-8"));
  } catch {
    return {};
  }
}
function saveChecksums(store) {
  const checksumsPath = getChecksumsPath();
  ensureDir(dirname(checksumsPath));
  writeFileSync2(checksumsPath, JSON.stringify(store, null, 2), "utf-8");
}
function getJobStore() {
  return new IngestJobStore(getVaultRoot2());
}
async function ingestArxiv(value, category) {
  const id = parseArxivId(value);
  if (!id)
    throw new Error(`Invalid ArXiv ID: ${value}`);
  const jobStore = getJobStore();
  const metaPath = safePath(getRawDir2(), join3(category, `arxiv-${id}.meta.json`));
  const job = await jobStore.createJob({ source: "arxiv", value: id, category });
  await jobStore.updateJob(job.jobId, { status: "fetching" });
  const metadata = await fetchArxivMetadata(id);
  metadata.arxivId = id;
  ensureDir(dirname(metaPath));
  writeFileSync2(metaPath, JSON.stringify(metadata, null, 2), "utf-8");
  const hash = await computeChecksum(metaPath);
  const checksums = loadChecksums();
  checksums[metaPath] = { sha256: hash, writtenAt: new Date().toISOString() };
  saveChecksums(checksums);
  await jobStore.updateJob(job.jobId, { status: "queued", rawPath: metaPath, metadata });
  return job;
}
async function ingestUrl(value, category) {
  const rawDir = getRawDir2();
  safePath(rawDir, category);
  const jobStore = getJobStore();
  const job = await jobStore.createJob({ source: "url", value, category });
  await jobStore.updateJob(job.jobId, { status: "fetching" });
  (async () => {
    try {
      const text = await fetchHtml(value);
      const safeName = value.replace(/[^a-z0-9]/gi, "_").slice(0, 64);
      const rawPath = safePath(rawDir, join3(category, `${Date.now()}--${safeName}.md`));
      ensureDir(dirname(rawPath));
      writeFileSync2(rawPath, text, "utf-8");
      const hash = await computeChecksum(rawPath);
      const checksums = loadChecksums();
      checksums[rawPath] = { sha256: hash, writtenAt: new Date().toISOString() };
      saveChecksums(checksums);
      await jobStore.updateJob(job.jobId, { status: "queued", rawPath });
    } catch (e) {
      await jobStore.updateJob(job.jobId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return job;
}
async function ingestFile(value, category) {
  if (!existsSync3(value))
    throw new Error(`File not found: ${value}`);
  const rawDir = getRawDir2();
  safePath(rawDir, category);
  const jobStore = getJobStore();
  const job = await jobStore.createJob({ source: "file", value, category });
  const destPath = safePath(rawDir, join3(category, `${Date.now()}--${basename3(value)}`));
  ensureDir(dirname(destPath));
  const content = readFileSync4(value);
  writeFileSync2(destPath, content);
  const hash = await computeChecksum(destPath);
  const checksums = loadChecksums();
  checksums[destPath] = { sha256: hash, writtenAt: new Date().toISOString() };
  saveChecksums(checksums);
  await jobStore.updateJob(job.jobId, { status: "queued", rawPath: destPath });
  return job;
}
async function saveNote(input) {
  const safeTitle = input.title.replace(/[^a-z0-9]/gi, "-").slice(0, 32);
  const id = `${Date.now()}--${safeTitle}`;
  const filePath = safePath(getKnowledgeDir2(), join3(input.category, `${id}.md`));
  ensureDir(dirname(filePath));
  const content = `# ${input.title}

${input.content}
`;
  writeFileSync2(filePath, content, "utf-8");
  const scores = loadDecayScores2();
  const filtered = scores.filter((s) => normalizeId2(s.itemId) !== normalizeId2(id));
  filtered.push({
    itemId: id,
    score: 0.5,
    lastAccess: new Date().toISOString(),
    accessCount: 0,
    summaryLevel: input.summaryLevel ?? "none",
    nextReviewAt: new Date().toISOString(),
    difficulty: 0.5
  });
  saveDecayScores(filtered);
  const hash = await computeChecksum(filePath);
  const checksums = loadChecksums();
  checksums[filePath] = { sha256: hash, writtenAt: new Date().toISOString() };
  saveChecksums(checksums);
  return { id, path: filePath, writtenAt: new Date().toISOString() };
}
function deleteEntry(input) {
  let filePath;
  if (input.path) {
    filePath = safePath(getVaultRoot2(), input.path);
  } else if (input.id) {
    const entry = scanKnowledge().find((e) => normalizeId2(e.id) === normalizeId2(input.id));
    if (!entry)
      throw new Error(`Entry not found: ${input.id}`);
    filePath = entry.path;
  } else {
    throw new Error("id or path required");
  }
  unlinkSync(filePath);
  const id = normalizeId2(basename3(filePath));
  const scores = loadDecayScores2();
  const filtered = scores.filter((s) => normalizeId2(s.itemId) !== normalizeId2(id));
  saveDecayScores(filtered);
  const checksums = loadChecksums();
  delete checksums[filePath];
  saveChecksums(checksums);
  return { deleted: true, path: filePath };
}
var vaultWriteTools = [
  {
    name: "vault_raw_ingest",
    description: "Fire-and-forget ingest of URL/file/ArXiv to raw vault layer. Returns jobId for async progress polling.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["url", "file", "arxiv"] },
        value: { type: "string", description: "URL / absolute file path / ArXiv ID or URL" },
        category: { type: "string", description: 'raw/ subdirectory, default "_inbox"' },
        priority: { type: "string", enum: ["high", "low"], default: "low" },
        arxivMetadata: { type: "boolean", description: "ArXiv: fetch metadata before storing, default true" }
      },
      required: ["source", "value"]
    },
    call: async (args) => {
      try {
        const category = args.category ?? "_inbox";
        let job;
        if (args.source === "arxiv") {
          job = await ingestArxiv(args.value, category);
        } else if (args.source === "url") {
          job = await ingestUrl(args.value, category);
        } else {
          job = await ingestFile(args.value, category);
        }
        return { content: [{ type: "text", text: JSON.stringify(job) }] };
      } catch (e) {
        return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
  },
  {
    name: "vault_note_save",
    description: "Write a structured note to the knowledge layer.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        category: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        summaryLevel: { type: "string", enum: ["deep", "shallow", "none"] }
      },
      required: ["title", "content", "category"]
    },
    call: async (args) => {
      try {
        const result = await saveNote(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
  },
  {
    name: "vault_delete",
    description: "Delete a vault entry (raw or knowledge).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        path: { type: "string" }
      }
    },
    call: async (args) => {
      try {
        const result = deleteEntry(args);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (e) {
        return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true };
      }
    }
  }
];

// src/amplify.ts
var AMPLIFY_BASE = "https://prod-api.vanderbilt.ai";
var config = null;
function configureAmplify(apiKey) {
  config = { apiKey };
}
function getHeaders() {
  if (!config?.apiKey)
    throw new Error("Amplify API key not configured. Call configureAmplify() first.");
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };
}
var amplifyTools = [
  {
    name: "amplify_list_models",
    description: "List available models on Vanderbilt Amplify. Returns model IDs, context windows, providers, and pricing tiers.",
    inputSchema: { type: "object", properties: {} },
    call: async () => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/available_models`, {
          headers: getHeaders()
        });
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  },
  {
    name: "amplify_chat",
    description: "Send a streaming chat message to Amplify. Returns Claude/GPT/Mistral responses via SSE.",
    inputSchema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string", description: "User message" },
        modelId: { type: "string", description: "Model ID (from amplify_list_models)" },
        systemPrompt: { type: "string", description: "Optional system prompt override" },
        temperature: { type: "number", description: "Temperature (0-2, default 0.7)" },
        maxTokens: { type: "number", description: "Max output tokens (default 4000)" },
        stream: { type: "boolean", description: "If true, yield chunks via onProgress callback instead of waiting for complete response (default false)" }
      }
    },
    call: async ({ message, modelId, systemPrompt, temperature = 0.7, maxTokens = 4000, stream = false }, onProgress) => {
      try {
        const body = {
          data: {
            model: modelId || "gpt-4o",
            temperature,
            max_tokens: maxTokens,
            messages: [{ role: "user", content: message }]
          }
        };
        if (systemPrompt) {
          body.data.messages.unshift({ role: "system", content: systemPrompt });
        }
        const res = await fetch(`${AMPLIFY_BASE}/chat`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`HTTP ${res.status}: ${err}`);
        }
        const reader = res.body?.getReader();
        if (!reader)
          throw new Error("No response body");
        const decoder = new TextDecoder;
        let buffer = "";
        let fullText = "";
        const processEventBlock = (block) => {
          for (const line of block.split(`
`)) {
            if (!line.startsWith("data: "))
              continue;
            let parsed;
            try {
              parsed = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            let textChunk = "";
            if (parsed?.data?.content) {
              textChunk = parsed.data.content;
            } else if (parsed?.data) {
              textChunk = typeof parsed.data === "string" ? parsed.data : JSON.stringify(parsed.data);
            }
            if (textChunk) {
              fullText += textChunk;
              if (stream && onProgress) {
                onProgress({ type: "chunk", text: textChunk });
              }
            }
          }
        };
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;
          buffer += decoder.decode(value, { stream: true });
          let sep;
          while ((sep = buffer.indexOf(`

`)) !== -1) {
            const eventBlock = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            processEventBlock(eventBlock);
          }
        }
        buffer += decoder.decode();
        if (buffer.length > 0) {
          processEventBlock(buffer);
          buffer = "";
        }
        return {
          content: [{ type: "text", text: fullText || "(no response)" }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  },
  {
    name: "amplify_files_query",
    description: "Query uploaded files on Amplify using semantic search. Returns relevant file chunks.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5)" }
      }
    },
    call: async ({ query, limit = 5 }) => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/files/query`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ query, limit })
        });
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  },
  {
    name: "amplify_files_list",
    description: "List tags/categories of uploaded files on Amplify.",
    inputSchema: { type: "object", properties: {} },
    call: async () => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/files/tags/list`, {
          headers: getHeaders()
        });
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  },
  {
    name: "amplify_assistants_list",
    description: "List your Amplify assistants.",
    inputSchema: { type: "object", properties: {} },
    call: async () => {
      try {
        const res = await fetch(`${AMPLIFY_BASE}/assistant/list`, {
          headers: getHeaders()
        });
        if (!res.ok)
          throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  }
];

// src/tool_policy.ts
var READONLY_TOOL_NAMES = new Set([
  "vault_status",
  "vault_taxonomy",
  "vault_search",
  "vault_get",
  "vault_batch_analyze"
]);
var MUTATION_TOOL_NAMES = new Set([
  "vault_raw_ingest",
  "vault_note_save",
  "vault_delete"
]);
function isDeleteOrAdminTool(name) {
  return name === "vault_delete" || name.includes("_delete") || name.includes("_admin") || name.startsWith("admin_");
}
function visibleToolsForProfile(tools, profile = getActiveProfile()) {
  return tools.filter((tool) => isToolAllowed(tool.name, profile));
}
function isToolAllowed(name, profile = getActiveProfile()) {
  if (profile === "admin")
    return true;
  if (profile === "readonly")
    return READONLY_TOOL_NAMES.has(name);
  return !isDeleteOrAdminTool(name);
}
function blockedToolResponse(name, profile = getActiveProfile()) {
  const guidance = isDeleteOrAdminTool(name) ? adminBlockedGuidance(name, profile) : readonlyBlockedGuidance(name, profile);
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        ...errorEnvelope(guidance.reason, guidance.next_step, { profile }),
        agent_guidance: guidance
      })
    }],
    isError: true
  };
}
function configureAllowed(profile = getActiveProfile()) {
  return profileAllowsMutation(profile);
}

// src/server.ts
import { createHash as createHash2, timingSafeEqual } from "crypto";
function loadAmplifyFromEnv() {
  if (process.env.AMPLIFY_API_KEY) {
    configureAmplify(process.env.AMPLIFY_API_KEY);
    console.error("[MCP] Loaded Amplify API key from AMPLIFY_API_KEY env var");
    return true;
  }
  return false;
}
loadAmplifyFromEnv();
var HOST = "0.0.0.0";
var TRANSPORT = process.env.MCP_TRANSPORT ?? "stdio";
var PORT = parseInt(process.env.MCP_PORT ?? "8765");
var SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
  "2024-10-07"
];
var DEFAULT_STREAMABLE_PROTOCOL_VERSION = "2025-03-26";
var allTools = [
  ...vaultTools,
  ...vaultWriteTools,
  ...amplifyTools
];
var toolMap = new Map(allTools.map((t) => [t.name, t]));
var sessions = new Map;
var streamableSessions = new Set;
function makeResponse(id, result, error) {
  return { jsonrpc: "2.0", id, result, error };
}
function generateSessionId() {
  return crypto.randomUUID();
}
function timingSafeStringEqual(a, b) {
  const ah = createHash2("sha256").update(a).digest();
  const bh = createHash2("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}
function negotiateProtocolVersion(requested) {
  if (typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return DEFAULT_STREAMABLE_PROTOCOL_VERSION;
}
function mcpResponseHeaders(sessionId) {
  const headers = new Headers;
  if (sessionId)
    headers.set("mcp-session-id", sessionId);
  return headers;
}
function makeMcpJsonError(status, code, message, sessionId) {
  return Response.json({
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  }, {
    status,
    headers: mcpResponseHeaders(sessionId)
  });
}
async function handleRequest(req) {
  const { method, id, params } = req;
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }
  if (method === "initialize") {
    return makeResponse(id, {
      protocolVersion: negotiateProtocolVersion(params?.protocolVersion),
      capabilities: {
        tools: { listChanged: false }
      },
      serverInfo: {
        name: "research-vault-mcp",
        version: "1.0.0"
      }
    });
  }
  if (method === "tools/list") {
    const visibleTools = visibleToolsForProfile(allTools, getActiveProfile());
    return makeResponse(id, {
      tools: visibleTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    });
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params;
    console.error("[DEBUG] tools/call:", name, JSON.stringify(args));
    if (!isToolAllowed(name, getActiveProfile())) {
      return makeResponse(id, blockedToolResponse(name, getActiveProfile()));
    }
    const tool = toolMap.get(name);
    if (!tool) {
      return makeResponse(id, undefined, { code: -32602, message: `Unknown tool: ${name}` });
    }
    try {
      const result = await tool.call(args || {});
      return makeResponse(id, { content: result.content, isError: result.isError });
    } catch (e) {
      return makeResponse(id, undefined, { code: -32603, message: `Tool error: ${e.message}` });
    }
  }
  if (method === "ping") {
    return makeResponse(id, {});
  }
  return makeResponse(id, undefined, { code: -32601, message: `Method not found: ${method}` });
}
async function handleStdioTransport() {
  const rl = await import("readline");
  const rli = rl.createInterface({ input: process.stdin, crlfDelay: Infinity });
  const writer = Bun.stdout.writer();
  const send = (obj) => {
    writer.write(JSON.stringify(obj) + `
`);
    writer.flush();
  };
  for await (const line of rli) {
    if (!line.trim())
      continue;
    try {
      const req = JSON.parse(line);
      const result = await handleRequest(req);
      if (result)
        send(result);
    } catch (e) {
      send({ jsonrpc: "2.0", error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` } });
    }
  }
}
var server;
async function httpHandler(req) {
  const url = new URL(req.url);
  if (url.pathname === "/mcp" && req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return makeMcpJsonError(400, -32700, `Parse error: ${e.message}`);
    }
    const messages = Array.isArray(body) ? body : [body];
    if (messages.length === 0) {
      return makeMcpJsonError(400, -32600, "Invalid Request: empty batch");
    }
    const hasInitialize = messages.some((message) => message?.method === "initialize");
    let sessionId = req.headers.get("mcp-session-id") ?? undefined;
    if (hasInitialize) {
      if (messages.length > 1) {
        return makeMcpJsonError(400, -32600, "Invalid Request: initialize must be sent alone");
      }
      sessionId = generateSessionId();
      streamableSessions.add(sessionId);
    } else {
      if (!sessionId) {
        return makeMcpJsonError(400, -32000, "Bad Request: Mcp-Session-Id header is required");
      }
      if (!streamableSessions.has(sessionId)) {
        return makeMcpJsonError(404, -32001, "Session not found", sessionId);
      }
    }
    const responses = [];
    for (const message of messages) {
      const result = await handleRequest(message);
      if (result)
        responses.push(result);
    }
    if (responses.length === 0) {
      return new Response(null, {
        status: 202,
        headers: mcpResponseHeaders(sessionId)
      });
    }
    return Response.json(Array.isArray(body) ? responses : responses[0], {
      status: 200,
      headers: mcpResponseHeaders(sessionId)
    });
  }
  if (url.pathname === "/mcp" && req.method === "GET") {
    return Response.json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method Not Allowed: /mcp supports POST JSON responses" },
      id: null
    }, {
      status: 405,
      headers: {
        Allow: "POST, DELETE"
      }
    });
  }
  if (url.pathname === "/mcp" && req.method === "DELETE") {
    const sessionId = req.headers.get("mcp-session-id") ?? undefined;
    if (!sessionId) {
      return makeMcpJsonError(400, -32000, "Bad Request: Mcp-Session-Id header is required");
    }
    if (!streamableSessions.has(sessionId)) {
      return makeMcpJsonError(404, -32001, "Session not found", sessionId);
    }
    streamableSessions.delete(sessionId);
    return new Response(null, { status: 204 });
  }
  if (url.pathname === "/sse" && req.method === "GET") {
    const sessionId = generateSessionId();
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder;
        const send = (data) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {}
        };
        send(`event: endpoint
data: /messages?sessionId=${sessionId}

`);
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat

`));
          } catch {
            clearInterval(heartbeat);
            sessions.delete(sessionId);
          }
        }, 15000);
        sessions.set(sessionId, { send, heartbeat });
        console.error(`[SSE] Session ${sessionId} connected`);
        req.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          sessions.delete(sessionId);
          console.error(`[SSE] Session ${sessionId} disconnected`);
        });
      }
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  }
  if (url.pathname === "/messages" && req.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || !sessions.has(sessionId)) {
      return Response.json({ error: "Invalid or missing sessionId" }, { status: 400 });
    }
    const session = sessions.get(sessionId);
    try {
      const body = await req.json();
      const result = await handleRequest(body);
      if (result) {
        session.send(`event: message
data: ${JSON.stringify(result)}

`);
      }
      return new Response(null, { status: 202 });
    } catch (e) {
      return Response.json({ jsonrpc: "2.0", error: { code: -32700, message: `Parse error: ${e.message}` } }, { status: 400 });
    }
  }
  if (url.pathname === "/health" && req.method === "GET") {
    const profile = getActiveProfile();
    const visibleTools = visibleToolsForProfile(allTools, profile);
    return Response.json({
      status: "ok",
      profile,
      public_safe_default: true,
      tools: visibleTools.length,
      total_registered_tools: allTools.length,
      visible_tools: visibleTools.map((tool) => tool.name),
      vault_tools: vaultTools.length,
      amplify_tools: amplifyTools.length,
      sse_sessions: sessions.size,
      streamable_sessions: streamableSessions.size,
      uptime: process.uptime()
    });
  }
  if (url.pathname === "/configure" && req.method === "POST") {
    const profile = getActiveProfile();
    if (!configureAllowed(profile)) {
      return Response.json(errorEnvelope(`/configure is unavailable while Research Vault MCP is running in ${profile} profile.`, "Set MCP_PROFILE=full or MCP_PROFILE=admin in a private operator session before configuring mutation-capable tools.", { profile }), { status: 403 });
    }
    const requiredSecret = process.env.MCP_CONFIGURE_SECRET;
    if (requiredSecret) {
      const providedSecret = req.headers.get("x-configure-secret") ?? "";
      if (!timingSafeStringEqual(providedSecret, requiredSecret)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    try {
      const { apiKey } = await req.json();
      if (!apiKey)
        throw new Error("apiKey required");
      configureAmplify(apiKey);
      return Response.json({ status: "configured" });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
function startHttpServer() {
  server = Bun.serve({
    port: PORT,
    hostname: HOST,
    fetch: httpHandler
  });
}
if (import.meta.main) {
  if (TRANSPORT === "stdio") {
    console.error("[MCP] Running in stdio mode (stdin/stdout JSON-RPC)");
    await handleStdioTransport();
    process.exit(0);
  } else {
    if (!process.env.MCP_CONFIGURE_SECRET) {
      console.error("[MCP] WARNING: /configure endpoint is unauthenticated. Set MCP_CONFIGURE_SECRET to require X-Configure-Secret header. Use AMPLIFY_API_KEY env var to skip /configure entirely.");
    }
    startHttpServer();
    console.log(`
\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557
\u2551   Research Vault MCP Server \u2014 MCP HTTP Transport    \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551  MCP:       http://${HOST}:${PORT}/mcp                \u2551
\u2551  SSE:       http://${HOST}:${PORT}/sse                \u2551
\u2551  Messages:  http://${HOST}:${PORT}/messages          \u2551
\u2551  Health:    http://${HOST}:${PORT}/health            \u2551
\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563
\u2551  Tools:     ${String(allTools.length).padEnd(3)} (${vaultTools.length} vault, ${amplifyTools.length} amplify)     \u2551
\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D
`);
  }
  process.on("SIGINT", () => {
    console.log(`
Shutting down...`);
    for (const [id, session] of sessions) {
      clearInterval(session.heartbeat);
    }
    sessions.clear();
    streamableSessions.clear();
    server?.stop();
    process.exit(0);
  });
}
export {
  loadAmplifyFromEnv,
  httpHandler
};
