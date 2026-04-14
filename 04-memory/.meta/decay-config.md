# Decay Configuration

## Ebbinghaus Decay Parameters

```yaml
half_life: 72h        # Base half-life for difficulty=1.0

difficulty_tiers:
  - name: "core"
    value: 4.0
    half_life_multiplier: 4.0
    description: "Core client/industry facts"

  - name: "technical"
    value: 2.0
    half_life_multiplier: 2.0
    description: "Technical knowledge"

  - name: "dialogue"
    value: 0.5
    half_life_multiplier: 0.5
    description: "Conversation extracts"

decay_formula: "e^(-time / (difficulty × half_life))"

maintenance_frequency: "weekly"
minimum_retention_threshold: 0.15   # Auto-archive below this
```

## Per-Tier Retention Targets

| Tier | Difficulty | Target Retention (72h) |
|------|------------|----------------------|
| public/dialogue | 0.5 | 36% |
| public/industry | 2.0 | 60% |
| restricted/relationship | 2.5 | 68% |
| restricted/risk | 3.5 | 84% |
| restricted/evolution | 4.0 | 90% |
