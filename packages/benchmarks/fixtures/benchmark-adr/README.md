# Benchmark ADR Fixture

Fixture for OpenCode benchmark harness (ADR restructure).

## Task: Five linked operations

1. **Delete** the Conclusion section (content is being promoted, not discarded).
2. **Insert** a new "## Premise" section after Context, with content rewritten from the former conclusion.
3. **Substitute** the forward reference in Decision: "See the rationale in our conclusion below" → "See the foundational premise above".
4. **Substitute** the framing term in Migration: "The legacy approach" → "The pre-event-sourcing approach".
5. **Insert** a comment on the Decision section's updated reference explaining the restructure history.

## Acceptance criteria

- Conclusion section is removed.
- A new Premise section exists after Context with the rewritten content.
- The forward reference in Decision points to the premise, not the conclusion.
- The framing term in Migration is updated.
- A historical comment explains the restructure.

## Files

- `adr-007-source.md` — ADR before restructure (input).
- `adr-007-golden.md` — Expected content after restructure (success target).
- `prompts.json` — Task description and workflow-specific instructions (A/B/C/D).
