# 04 — Memory

Three-tier memory system with Ebbinghaus decay algorithm.

## Directory Structure

```
04-memory/
├── public/              ← All agents can read and write
│   ├── client/         ← Client profiles and facts
│   ├── industry/        ← Industry data and trends
│   └── dialogue/        ← Conversation extracts + satisfaction logs
├── restricted/          ← Admin-only access tier
│   ├── relationship/   ← Stakeholder mapping
│   ├── risk/            ← Risk assessment and due diligence
│   └── evolution/        ← Self-evolution tracking
└── .meta/              ← Decay system metadata
    ├── decay-config.md  ← Decay algorithm parameters
    ├── decay-scores.json  ← Per-entry retention scores
    └── access-log.jsonl  ← Access history
```

## Decay Mechanism

Memory entries decay over time based on their `difficulty` value:

```
retention(t) = e^(-t / (difficulty × half_life))
```

Default half-life: **72 hours**

| Difficulty | Half-life | Tier | Example |
|------------|-----------|------|---------|
| 0.5 | 36h | public | Dialogue extracts |
| 2.0 | 144h | public | Industry knowledge |
| 2.5 | 180h | restricted | Relationship data |
| 4.0 | 288h | restricted | Core facts |

## Maintenance

```bash
# Run weekly decay maintenance
# (via /loop script)
```

## Access Control

- `public/` — All agents: Read + Write freely
- `restricted/` — Admin only: Write via review gate
- No agent accesses `03-internal-only/`

---

*Decay scores are auto-updated by the maintenance loop*
