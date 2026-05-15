# Quickstart — five-minute reproducibility path

A walk from "fresh clone" to "agent answering from a decaying memory" in
seven steps. Every step lists what the MCP server actually returns so
you can pattern-match success without guessing.

> The full vault template lives in `04-memory/`. This quickstart uses a
> smaller, MCP-shaped sample at [`examples/quickstart-vault/`](./examples/quickstart-vault/)
> so `vault_search` / `vault_status` / `vault_taxonomy` return real data
> on first run.

---

## 0. Prerequisites

- [Bun](https://bun.sh) on `PATH` — the MCP server is Bun-native.
  `npx` is supported as a launcher but still execs `bun` underneath.
- An MCP-compatible client (Claude Desktop, Claude Code, or anything
  that speaks JSON-RPC over stdio / Streamable HTTP).

```bash
bun --version    # ≥ 1.1
```

---

## 1. Install

```bash
git clone https://github.com/Fearvox/dash-research-vault.git
cd dash-research-vault
```

You don't need to install the npm package globally — the MCP client
will launch it via `npx -y @syndash/research-vault-mcp` on first use.

---

## 2. Set `VAULT_ROOT`

Point the MCP server at the included sample vault:

```bash
export VAULT_ROOT="$(pwd)/examples/quickstart-vault"
```

The sample contains two analyzed notes (`sample-conversation`,
`sample-trend`), one taxonomy file, and a populated `decay-scores.json`.
Layout matches what the MCP server scans:

```
$VAULT_ROOT/
├── knowledge/<category>/<file>.md      ← read by vault_search / vault_get
├── knowledge/_taxonomy.md              ← read by vault_taxonomy
├── .meta/decay-scores.json             ← read by vault_status
└── raw/_inbox/                         ← read by vault_batch_analyze
```

---

## 3. Run the MCP server

### Option A — wire it into your MCP client (production path)

`~/.config/claude/claude_desktop_config.json` (or the Claude Code
equivalent):

```json
{
  "mcpServers": {
    "research_vault": {
      "command": "npx",
      "args": ["-y", "@syndash/research-vault-mcp", "--transport=stdio"],
      "env": {
        "VAULT_ROOT": "/absolute/path/to/dash-research-vault/examples/quickstart-vault"
      }
    }
  }
}
```

Restart the client. `research_vault` should appear in the MCP server
list with five tools visible (the readonly default — see step 6).

### Option B — standalone HTTP for sanity check

```bash
MCP_PORT=8765 npx -y @syndash/research-vault-mcp --transport=http
```

In another shell:

```bash
curl -s http://127.0.0.1:8765/health
```

```json
{"status":"ok","transport":"http"}
```

---

## 4. Query a sample memory

In your MCP client, ask the agent to call `vault_search`:

> Use the `vault_search` tool with `query: "memory"` and tell me what
> you get back.

Expected response (elided):

```jsonc
{
  "ok": true,
  "data": {
    "query": "memory",
    "results": [
      {
        "id": "sample-trend",
        "title": "Persistent memory becomes table stakes",
        "category": "industry",
        "score": 0.91,
        "summaryLevel": "deep",
        "accessCount": 3,
        "matched_fields": ["title", "content"],
        "why_matched": "Matched query \"memory\" in title, note content.",
        "snippet": "# Persistent memory becomes table stakes Vendors shipping AI agents in 2026 are converging on local-first persistent memory as the default...",
        "source_ref": "vault://knowledge/industry/sample-trend",
        "freshness_verdict": "PASS"
      }
    ],
    "total": 1
  },
  "agent_guidance": {
    "verdict": "PASS",
    "next_step": "Use source_ref or vault_get for bounded follow-up evidence.",
    "recommended_tool": "vault_get"
  },
  "evidence": {
    "as_of": "2026-05-15T...",
    "profile": "readonly",
    "public_safe": true,
    "freshness": "Search result analysis metadata is fresh.",
    "provenance": "vault_search result source_ref values are vault:// references without local paths."
  }
}
```

Then fetch the bounded excerpt:

> Now call `vault_get` with `id: "sample-trend"`.

```jsonc
{
  "ok": true,
  "data": {
    "id": "sample-trend",
    "source_ref": "vault://knowledge/industry/sample-trend",
    "content_kind": "excerpt",
    "truncated": false,
    "chars_returned": 578,
    "max_chars": 1200,
    "content": "# Persistent memory becomes table stakes\n\nVendors shipping AI agents..."
  }
}
```

`vault_get` returns an **excerpt** by default, capped at 1200 chars.
Pass `include_content: true` for the full body (still capped at 12000).

---

## 5. Inspect decay status

> Call `vault_status`.

```jsonc
{
  "ok": true,
  "data": {
    "total": 2,
    "analyzed": 2,
    "deep": 1,
    "shallow": 1,
    "dormant": 0,
    "pending_raw": 0,
    "top5": [
      { "itemId": "sample-trend",        "score": 0.91, "accesses": 3 },
      { "itemId": "sample-conversation", "score": 0.62, "accesses": 7 }
    ],
    "analyzed_coverage": 1.0,
    "last_analyzed_at": "2026-05-14T08:00:00.000Z",
    "release": {
      "package_name": "@syndash/research-vault-mcp",
      "freshness_verdict": "FLAG",
      "freshness_reason": "Release freshness was not provided by the runtime environment."
    }
  },
  "agent_guidance": { "verdict": "FLAG", "next_step": "Set RESEARCH_VAULT_NPM_LATEST_VERSION, ..." }
}
```

The `FLAG` is expected — release-freshness env vars
(`RESEARCH_VAULT_NPM_LATEST_VERSION`, `RESEARCH_VAULT_NPM_MODIFIED_AT`,
`RESEARCH_VAULT_PUBLIC_REPO_URL`) are operator-supplied and not part
of the demo. The vault data itself is fresh.

The retention contract: `sample-trend` (industry, difficulty 2.0)
holds at 0.91 because its 6-day half-life hasn't kicked in.
`sample-conversation` (dialogue, difficulty 0.5) is already at 0.62
after a few days — exactly the asymmetry the per-document decay model
is designed to produce.

---

## 6. Safety boundary — `readonly` vs `full` vs `admin`

The MCP server exposes a different tool surface depending on
`MCP_PROFILE`. Default is `readonly`.

| Profile    | Visible tools                                                                 | Mutators | Destructive |
|------------|-------------------------------------------------------------------------------|----------|-------------|
| `readonly` | `vault_search`, `vault_get`, `vault_status`, `vault_taxonomy`, `vault_batch_analyze` | hidden   | hidden      |
| `full`     | readonly tools + `vault_raw_ingest`, `vault_note_save`                        | exposed  | hidden      |
| `admin`    | all of the above + `vault_delete`                                             | exposed  | exposed     |

Try the boundary. With the default profile, ask the agent:

> Try calling `vault_note_save` with title "test" and content "hi".

The tool isn't even in the manifest, but if you call it directly
you get a refusal envelope:

```jsonc
{
  "ok": false,
  "data": null,
  "agent_guidance": {
    "verdict": "BLOCK",
    "reason": "vault_note_save is unavailable while Research Vault MCP is running in readonly profile.",
    "next_step": "Use vault_search for readonly evidence, or switch to MCP_PROFILE=full ...",
    "recommended_tool": "vault_search"
  },
  "evidence": { "profile": "readonly", "public_safe": true }
}
```

Widen the surface in a private operator session by adding to the MCP
client config:

```json
"env": {
  "VAULT_ROOT": "/absolute/path/to/examples/quickstart-vault",
  "MCP_PROFILE": "full"
}
```

`vault_raw_ingest` and `vault_note_save` now appear in the manifest;
`vault_delete` still doesn't. Switch to `MCP_PROFILE=admin` to unlock
destructive deletes — only do this in a session you trust.

The boundary is enforced at two layers:

1. `visibleToolsForProfile` filters the tool manifest before the
   client sees it.
2. `isToolAllowed` re-checks at call time so a client can't bypass
   the manifest by guessing tool names.

---

## 7. What you've just verified

- Memory loads from a markdown directory — no DB, no daemon.
- Read responses carry `provenance`, `freshness`, `profile`, and
  `public_safe` metadata, so an agent can decide whether to trust
  what it just got.
- `vault_get` is bounded by default; full content needs an explicit
  `include_content: true` and respects `max_chars`.
- The decay curve is per-document, weighted by `difficulty` — which
  is why a single high-value industry note outlives a thousand
  dialogue fragments.
- Mutation lives behind an opt-in profile gate, and destructive
  delete behind a stricter one.

To make it your own: replace the two notes in
`examples/quickstart-vault/knowledge/`, regenerate
`.meta/decay-scores.json` with your own analyzer, and re-point
`VAULT_ROOT`. The substrate doesn't care what the notes are about.
