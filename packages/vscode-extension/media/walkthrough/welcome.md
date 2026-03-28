<!-- changedown.com/v1: tracked -->
## What is ChangeDown?

ChangeDown adds **popular editor-style change tracking** to Markdown files. Changes are stored as inline markup (CriticMarkup) with metadata in footnotes — no proprietary format, no lock-in.

### Three ways to work

ChangeDown works across **three surfaces** — use whichever fits your workflow:

- **Editor** — keyboard shortcuts, toolbar buttons, and the sidebar panel right here in VS Code
- **Agent** — AI agents (Claude Code, Cursor, OpenCode) propose and review changes via MCP
- **CLI** — `changedown init`, `changedown status`, `changedown diff` from the terminal

All three read and write the same CriticMarkup format. A change proposed by an agent looks identical to one made by a human in the editor.[^cn-1]

### What you'll see[^cn-2][^cn-1]

| Color | Meaning | Syntax |
|-------|---------|--------|
| **Green** | Inserted text | `{++added++}` |
| **Red** (strikethrough) | Deleted text | `{--removed--}` |
| **Blue** | Substitution (old → new) | `{~~old~>new~~}` |
| **Yellow** | Highlighted / commented | `{==text==}{>>note<<}` |

### How it works

1. **Humans and AI agents** propose changes in the same document
2. Each change has a **footnote** with author, date, status, and discussion
3. **Accept** keeps the change. **Reject** reverts it. That's it.

[^cn-3.1]
Continue to the next step to open the demo file, which has examples of all four change types.[^cn-3.2]


[^cn-1]: @ai:claude-opus-4.6 | 2026-03-01 | sub | accepted
    @ai:claude-opus-4.6 2026-03-01T07:36:05Z: Add three-surface framing section to welcome walkthrough card so new users understand ChangeDown works beyond VS Code keybindings
    approved: @ai:claude-opus-4.6 2026-03-01T07:36:26Z "Add three-surface framing to welcome card for init experience redesign"

[^cn-2]: @ai:claude-opus-4.6 | 2026-03-01 | sub | accepted
    @ai:claude-opus-4.6 2026-03-01T07:36:49Z: Add missing blank line between paragraph and heading for valid markdown formatting
    approved: @ai:claude-opus-4.6 2026-03-01T07:36:51Z "Fix missing blank line between paragraph and heading"

[^cn-3.1]: @ai:claude-opus-4.6 | 2026-03-06 | del | accepted
    approved: @ai:claude-opus-4.6 2026-03-06T22:21:53Z "Remove outdated reference to demo file auto-opening — setupProject no longer opens it"

[^cn-3.2]: @ai:claude-opus-4.6 | 2026-03-06 | ins | accepted
    approved: @ai:claude-opus-4.6 2026-03-06T22:21:53Z "Replace with forward reference to the new Open Demo walkthrough step"

[^cn-3]: @ai:claude-opus-4.6 | 2026-03-06 | group | proposed
    @ai:claude-opus-4.6 2026-03-06T22:21:36Z: propose_batch