## Author Identity

Your author name appears in footnotes whenever you accept, reject, or comment on changes.

### Humans

Use your name or handle:

```
[^ct-1]: @alice | 2026-02-27 | insertion | proposed
    @alice 2026-02-27: Added the error handling section.
```

### AI Agents

Use the `@ai:` namespace with the model name:

```
[^ct-2]: @ai:claude-opus-4.6 | 2026-02-27 | substitution | proposed
    @ai:claude-opus-4.6 2026-02-27: Changed REST to GraphQL for consistency.
```

### Enforcement

- **Optional** (default): anyone can edit without setting an author name
- **Required**: every change must have an author — useful for review workflows where attribution matters

Set your identity in the **Author** section of the Settings panel.
