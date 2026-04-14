# Public Memory — Client

Client profiles, facts, and non-sensitive contact information.

## Guidelines

- No UUIDs or internal identifiers
- Use generic client codes (Client-A, Client-B) for examples
- All entries should have a `difficulty` tag for decay calculation

## File Naming

```
YYYY-MM-DD-client-name.md
```

## Frontmatter Template

```markdown
---
difficulty: 2.0
last_accessed: 2026-04-01
source: public
---

# Client Name

## Key Facts
- [fact]
- [fact]

## Notes
[notes]
```

---

*Entries here decay at public rate. High-value facts should be elevated to restricted tier after verification.*
