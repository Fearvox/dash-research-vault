# Vault Taxonomy

Two demo categories. Difficulty values match the Ebbinghaus decay tiers
documented in `04-memory/.meta/decay-config.md`.

| Category    | Tier   | Difficulty | Effective half-life |
|-------------|--------|------------|---------------------|
| `dialogue/` | public | 0.5        | 36 hours            |
| `industry/` | public | 2.0        | 144 hours (~6 days) |

`vault_taxonomy` returns this file plus per-category counts derived from
the `knowledge/` tree at request time.
