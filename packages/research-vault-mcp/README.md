# @syndash/research-vault-mcp

Research Vault MCP is the installable server for **Dash Research Vault**. It gives MCP-compatible agents a public-safe way to search, inspect, and operate a markdown knowledge vault.

It is not the whole vault template or the whole Evensong research project. This package is the runtime adapter: MCP tools, read-only defaults, bounded reads, public-surface redaction, and optional mutation profiles for operator-approved sessions.

Source: <https://github.com/Fearvox/dash-research-vault/tree/main/packages/research-vault-mcp>

## Install

```bash
# MCP clients usually launch the package for you.
# The npm shim still delegates runtime execution to Bun.
npx @syndash/research-vault-mcp --transport=stdio

# Bun direct launch:
bunx @syndash/research-vault-mcp --transport=stdio
```

Default transport is `stdio`, because command-launched MCP servers are expected to speak JSON-RPC over stdin/stdout. Install [Bun](https://bun.sh) before using either `npx` or `bunx`; the server itself is Bun-native.

**Runtime note:** `@syndash/research-vault-mcp` is Bun-native. `npx` is supported as an install/launch shim, but the target machine must have `bun` available on `PATH`. If you need a pure Node runtime, treat that as a separate compatibility track rather than assuming this package already provides it.

Use HTTP only when you explicitly want a long-running remote MCP server. The HTTP server exposes both the current Streamable HTTP endpoint and the legacy SSE endpoint:

```bash
MCP_PORT=8765 npx @syndash/research-vault-mcp --transport=http
# streamable: http://127.0.0.1:8765/mcp
# legacy sse: http://127.0.0.1:8765/sse
# health:     http://127.0.0.1:8765/health
```

## Configure an MCP client

Claude Desktop / Claude Code style config:

```json
{
  "mcpServers": {
    "research_vault": {
      "command": "npx",
      "args": ["-y", "@syndash/research-vault-mcp", "--transport=stdio"]
    }
  }
}
```

Bun variant:

```json
{
  "mcpServers": {
    "research_vault": {
      "command": "bunx",
      "args": ["--bun", "@syndash/research-vault-mcp", "--transport=stdio"]
    }
  }
}
```

Local monorepo development:

```json
{
  "mcpServers": {
    "research_vault_dev": {
      "command": "bun",
      "args": ["run", "packages/research-vault-mcp/src/server.ts", "--transport=stdio"]
    }
  }
}
```

## Configure the vault root

Set the vault location with an environment variable before launching your MCP client:

```bash
export VAULT_ROOT=/path/to/research-vault
```

The package is designed for markdown-based knowledge bases. Keep private vault contents outside the public Dash Research Vault repo.

## MCP Profiles

`MCP_PROFILE=readonly` is the default public-safe autonomous-agent profile. It exposes only read/evidence tools:

- `vault_status`
- `vault_taxonomy`
- `vault_search`
- `vault_get`
- `vault_batch_analyze`

Mutation tools are hidden and blocked in `readonly`. `MCP_PROFILE=full` enables non-destructive mutators such as `vault_raw_ingest` and `vault_note_save`. `MCP_PROFILE=admin` is required for destructive or admin tools such as `vault_delete`.

`vault_get` is bounded by default: it returns an excerpt unless the operator approves `include_content:true`, and even full-content requests are capped by `max_chars`. Search, status, and batch responses include `agent_guidance` plus evidence metadata for provenance, freshness, profile, and public-safety state.

## Search and read semantics

`vault_search` is an index/readability surface. It answers whether the query matched saved knowledge entries and whether those entries are readable. It does not treat missing analysis metadata as missing content.

Search matching covers:

- exact note IDs, marked with `matched_fields: ["id_exact"]`
- titles, note content, IDs, and categories
- punctuation-normalized text, so slash-heavy categories such as `software-engineering/game-design` can be found with `software engineering game design`

Search results separate the relevant states:

```json
{
  "readability_verdict": "PASS",
  "index_verdict": "PASS",
  "analysis_verdict": "NOT_ANALYZED",
  "freshness_verdict": "PASS"
}
```

That means the note matched and is readable, but has no `lastAnalyzedAt` yet. Treat `NOT_ANALYZED` as an analysis caveat, not a broken read. Stale or invalid analysis timestamps still produce a `FLAG`.

`vault_get` is the authoritative exact-ID read path for follow-up evidence. Call `vault_search` first, then pass the exact returned `id` to `vault_get`.

## Tools exposed

Current MCP contract:

- `vault_search` — search analyzed knowledge-base entries
- `vault_status` — registry, retention, and decay health
- `vault_taxonomy` — category tree and item counts
- `vault_batch_analyze` — raw queue status and preview
- `vault_get` — retrieve a saved vault item by id
- `vault_raw_ingest` — queue a raw URL/text ingest job (`full` or `admin` profile only)
- `vault_note_save` — persist a markdown note into the vault (`full` or `admin` profile only)
- `vault_delete` — delete a saved vault item (`admin` profile only; destructive)
- `amplify_*` — optional remote RAG query layer when Amplify credentials are configured

Public MCP responses are redacted before they leave the server if they contain local paths, credential markers, or private network values. Use a private operator session for diagnostics that need raw source details.

## Package mechanics

Published packages include:

- `bin/research-vault-mcp.mjs`
- `dist/server.js`
- `src/**/*.ts` for source inspection
- `README.md`
- `CHANGELOG.md`
- `package.json`

The bin prefers `dist/server.js`. In a monorepo checkout without `dist`, it falls back to `bun run src/server.ts` so development remains fast without a separate compile step.

## Architecture

Research Vault MCP uses a multi-signal ranker for candidate retrieval:

```text
score(d, q, t) = lexical(q,d)
               + semantic(embed(q), embed(d))
               + recency/stability(d,t)
               + access frequency(d)
               + summary-level weight(d)
```

The research papers and figures in the repository root document the memory-causation evidence behind the vault template. The MCP package stays focused on the installable server surface.

## Node compatibility status

The package is intentionally Bun-native today because the server uses Bun APIs. The npm bin is Node-compatible only as a launcher: it locates `dist/server.js` or `src/server.ts`, then delegates execution to `bun`. This keeps package installation convenient while avoiding a misleading claim that the MCP server itself runs under plain Node.js.

## License

Apache-2.0 for package code. Research artifacts in the repository root may use separate licenses; check the repository root license files.

## Releases

See [CHANGELOG.md](./CHANGELOG.md). Current npm release: `1.1.5`.
