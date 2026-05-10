# Changelog

## Unreleased

## 1.1.4 — 2026-05-10

### Changed

- Published the package source under the canonical Dash Research Vault repo path: `packages/research-vault-mcp`.
- Updated README language to treat Dash Research Vault as the package home and Evensong as research provenance, not the npm package repository.
- Updated package metadata description and release docs to match the public npm source path.

## 1.1.3 — 2026-05-10

### Added

- HTTP transport now supports Streamable HTTP at `POST /mcp`, while keeping the legacy `/sse` + `/messages` endpoints.
- Added a Streamable HTTP regression test that initializes a session and lists MCP tools through `/mcp`.
- Documented the default read-only MCP profile, including the public-safe read/evidence tool surface and the `full`/`admin` opt-in for mutation-capable tools.
- Added public guidance for the provenance/freshness response envelope, including `agent_guidance` and evidence metadata on search, status, and batch responses.

### Changed

- `vault_get` is documented as bounded by default, with operator-approved `include_content:true` and `max_chars` caps for larger reads.
- Mutation blocking guidance now tells operators to restart in `MCP_PROFILE=full` or `MCP_PROFILE=admin` before using write/configure tools.
- Public-surface safety redaction is documented for local paths, credential markers, and private network values.

## 1.1.2 — 2026-04-26

### Changed

- Default MCP transport is now `stdio`, matching command-launched MCP clients.
- The npm bin is a Node-compatible launcher that delegates server execution to Bun.
- Published package includes `dist/server.js` via `prepack` build and `files` allowlist.
- README now documents install commands, Claude config, Bun runtime requirement, and explicit SSE mode.
- Package metadata now includes public repository information and Apache-2.0 package license.

### Verified

- `bun --filter @syndash/research-vault-mcp test`
- `bun --filter @syndash/research-vault-mcp build`
- `npm pack --dry-run --json`
- stdio smoke returning 13 MCP tools
