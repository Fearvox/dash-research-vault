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
└── raw/_inbox/                             ← empty queue
```

Replace the contents with your own notes once you've confirmed the
read surface works.
