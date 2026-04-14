# Public Memory — Dialogue

Conversation extracts, meeting notes, and satisfaction logs.

## File Naming

```
YYYY-MM-DD-dialogue-summary.md
```

## Satisfaction Log

Format: `satisfaction-log.yaml`

```yaml
- date: 2026-04-01
  agent: FA
  satisfaction: high
  topics: [market-analysis, paper-writing]
  notes: "Strong performance on technical synthesis"
```

## Decay Notes

Dialogue entries decay fastest (difficulty=0.5) unless:
- Cited by 3+ other entries
- Marked as high-value by Admin

---

*Default difficulty=0.5. Elevate frequently-cited entries manually.*
