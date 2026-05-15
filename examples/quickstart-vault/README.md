# Quickstart Sample Vault

A minimal, fully-formed vault that matches the layout
`@syndash/research-vault-mcp` expects. Two analyzed notes, one taxonomy
file, and a populated decay-scores store — enough for `vault_search`,
`vault_status`, `vault_taxonomy`, and `vault_get` to return real data.

Used by [`QUICKSTART.md`](../../QUICKSTART.md). Point `VAULT_ROOT` here:

```bash
export VAULT_ROOT="$(pwd)/examples/quickstart-vault"
```

Layout:

```
quickstart-vault/
├── knowledge/
│   ├── _taxonomy.md
│   ├── dialogue/sample-conversation.md     ← difficulty 0.5
│   └── industry/sample-trend.md            ← difficulty 2.0
├── .meta/
│   └── decay-scores.json                   ← retention + access counts
├── raw/_inbox/                             ← empty queue
└── refresh-fixture.ts                      ← rewrites decay-scores.json
                                              with timestamps relative
                                              to your clock
```

The MCP server's `staleVerdict` flags any `lastAnalyzedAt` older than
7 days. The shipped JSON carries fixed dates for repo readability —
run `bun examples/quickstart-vault/refresh-fixture.ts` before the
demo so `freshness_verdict: "PASS"` holds whenever you clone.

Replace the contents with your own notes once you've confirmed the
read surface works.
