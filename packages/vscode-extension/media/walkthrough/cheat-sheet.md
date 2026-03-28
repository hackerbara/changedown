## Quick Reference

### Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Accept change | Alt+Cmd+Y | Ctrl+Alt+Y |
| Reject change | Alt+Cmd+N | Ctrl+Alt+N |
| Toggle tracking | Alt+Cmd+T | Ctrl+Alt+T |
| Add comment | Alt+Cmd+/ | Ctrl+Alt+/ |
| Next change | Alt+Cmd+] | Ctrl+Alt+] |
| Previous change | Alt+Cmd+[ | Ctrl+Alt+[ |
| Show diff | Alt+Cmd+D | Ctrl+Alt+D |
| Annotate from git | Alt+Cmd+G | Ctrl+Alt+G |
| Go to linked change | Alt+Cmd+M | Ctrl+Alt+M |[^cn-1]

### Toolbar Buttons (editor title bar)

- **Dot icon** — Toggle tracking mode (auto-wrap your edits)
- **Eye icon** — Toggle smart view (hide/show CriticMarkup delimiters)
- **Comment icon** — Insert a comment at cursor

### CriticMarkup Syntax

| Type | Write this | Result |
|------|-----------|--------|
| Insert | `{++new text++}` | new text (green) |
| Delete | `{--old text--}` | ~~old text~~ (red) |
| Replace | `{~~old~>new~~}` | old → new (blue) |
| Highlight | `{==text==}` | text (yellow) |
| Comment | `{>>note<<}` | Inline note |

### Sidebar

ChangeDown has its own Activity Bar icon. The sidebar contains two panels:

- **Review** — a single-page view with four cognitive zones: **Configure** (tracking toggle + view mode), **Navigate** (prev/next), **Bulk Act** (accept all / reject all), and **Changes** (scrollable change cards). Navigate, accept, and reject changes without leaving the panel.
- **Project Settings** — visual config editor for `.changedown/config.toml`

### Agent Workflow

Ask your AI agent to work with tracked files directly:

- **Propose a change** — "Review this document and suggest improvements"
- **Accept/reject** — "Accept all proposed changes" or "Reject ct-3"
- **Discuss** — "Why did you delete that paragraph?" (replies appear in the change thread)

Agents use the same CriticMarkup format. Their changes show up in the editor and sidebar instantly.

### CLI Commands

```
changedown init           # Initialize tracking in a project
changedown status         # Show tracked files and pending changes
changedown diff           # Show changes in diff format
```[^cn-2]
[^cn-1]: @ai:claude-opus-4.6 | 2026-02-28 | sub | accepted
    @ai:claude-opus-4.6 2026-02-28: Replace Shift+Cmd keybindings with Alt+Cmd scheme and add new bindings for git annotate and linked change navigation
    approved: @ai:claude-opus-4.6 2026-02-28 "Keybinding update from Shift+Cmd to Alt+Cmd scheme to avoid VS Code conflicts"

[^cn-2]: @ai:claude-opus-4.6 | 2026-03-01 | sub | accepted
    @ai:claude-opus-4.6 2026-03-01T07:36:13Z: Add agent workflow and CLI command sections to cheat sheet for three-surface coverage
    approved: @ai:claude-opus-4.6 2026-03-01T07:36:28Z "Add agent workflow and CLI command sections for three-surface coverage"