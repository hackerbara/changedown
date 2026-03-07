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
| Go to linked change | Alt+Cmd+M | Ctrl+Alt+M |

### Toolbar Buttons (editor title bar)

- **Dot icon** — Toggle tracking mode (auto-wrap your edits)
- **Eye icon** — Toggle smart view (hide/show CriticMarkup delimiters)
- **Comment icon** — Insert a comment at cursor

### CriticMarkup Syntax

| Type | Write this | Result |
|------|-----------|--------|
| Insert | `new text` | new text (green) |
| Delete | `` | ~~old text~~ (red) |
| Replace | `new` | old → new (blue) |
| Highlight | `text` | text (yellow) |
| Comment | `` | Inline note |

### Sidebar

ChangeTracks has its own Activity Bar icon. The sidebar contains two panels:

- **Review** — a single-page view with four cognitive zones: **Configure** (tracking toggle + view mode), **Navigate** (prev/next), **Bulk Act** (accept all / reject all), and **Changes** (scrollable change cards). Navigate, accept, and reject changes without leaving the panel.
- **Project Settings** — visual config editor for `.changetracks/config.toml`

### Agent Workflow

Ask your AI agent to work with tracked files directly:

- **Propose a change** — "Review this document and suggest improvements"
- **Accept/reject** — "Accept all proposed changes" or "Reject ct-3"
- **Discuss** — "Why did you delete that paragraph?" (replies appear in the change thread)

Agents use the same CriticMarkup format. Their changes show up in the editor and sidebar instantly.

### CLI Commands

```
changetracks init           # Initialize tracking in a project
changetracks status         # Show tracked files and pending changes
changetracks diff           # Show changes in diff format
```
