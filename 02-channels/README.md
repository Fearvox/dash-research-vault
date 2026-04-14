# 02 — Channels

Communication channel definitions for agent coordination.

## Channel Types

| Channel | Purpose | Access |
|---------|---------|--------|
| `all.md` | Broadcast to entire team | All agents + Researcher |
| `market-intel.md` | Market research and data | All agents |
| `investment.md` | Investment thesis discussion | Admin + FA + MA |
| `operation.md` | Day-to-day operations | Ops + Admin |
| `internal.md` | Internal review and strategy | Admin + agents |
| `dash-sync.md` | Vault sync and updates | All agents |

## Channel Notes

- `dash-sync.md` is automatically updated by `/loop` scripts
- `internal.md` is the primary review gate for restricted memory writes
- All channels support markdown formatting

---

*Configure channel webhooks or bot integrations in `codex-sync/config.json`*
