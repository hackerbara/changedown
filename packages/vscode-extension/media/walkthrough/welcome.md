## What is ChangeTracks?

ChangeTracks adds **popular editor-style change tracking** to Markdown files. Changes are stored as inline markup (CriticMarkup) with metadata in footnotes — no proprietary format, no lock-in.

### Three ways to work

ChangeTracks works across **three surfaces** — use whichever fits your workflow:

- **Editor** — keyboard shortcuts, toolbar buttons, and the sidebar panel right here in VS Code
- **Agent** — AI agents (Claude Code, Cursor, OpenCode) propose and review changes via MCP
- **CLI** — `changetracks init`, `changetracks status`, `changetracks diff` from the terminal

All three read and write the same CriticMarkup format. A change proposed by an agent looks identical to one made by a human in the editor.

### What you'll see

| Color | Meaning | Syntax |
|-------|---------|--------|
| **Green** | Inserted text | `added` |
| **Red** (strikethrough) | Deleted text | `` |
| **Blue** | Substitution (old → new) | `new` |
| **Yellow** | Highlighted / commented | `text` |

### How it works

1. **Humans and AI agents** propose changes in the same document
2. Each change has a **footnote** with author, date, status, and discussion
3. **Accept** keeps the change. **Reject** reverts it. That's it.

Continue to the next step to open the demo file, which has examples of all four change types.
