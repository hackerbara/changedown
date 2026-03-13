# What's Next

## Recent

- **Playwright test harness** — Executable Gherkin specs across three speed tiers: fast (parser, sub-second), slow (VS Code Electron via Playwright), visual (screenshot comparison against golden baselines). 586 fast scenarios passing.
- **VS Code LSP refactor** — Thin extension client with heavy logic moved to the language server. CodeLens, diagnostics, and compaction all computed server-side.
- **DOCX preview** — Import and export tracked markdown as Word documents. Footnote metadata preserved as Word comments.
- **Enhanced MCP surface** — Six tools: propose, amend, supersede, review, list, read. Hash-verified coordinates prevent stale edits across agent turns.

## In Progress

- **Tool shaping** — Benchmark harness measuring agent compliance and change quality across models. Shaping the tool interface to match how agents naturally work.
- **Editor ergonomics** — Cursor-gated CodeLens, smart view transitions, decoration contrast fixes for WCAG AA compliance.
- **Agent ergonomics** — Standalone comment path (annotate without changing text), heading-aware coordinate matching, edit hook refinement.
- **Collaboration** — Per-author color system, bidirectional panel highlighting, threaded discussion in the review panel.
- **Git integration** — SCM sidebar integration, diff adapter for surfacing tracked changes alongside git history.

## Longer Term

- **Universal change review** — Git diff, GitHub PR, and Jujutsu adapters feeding the same ChangeNode[] IR. One UI for reviewing changes regardless of source.
- **Multi-editor** — Neovim (conceal/match architecture investigated), Sublime Text, web-based editors via LSP over WebSocket.
 - **Cryptographic attestation** — Signed change provenance. Verify that a change was actually proposed by the agent that claims it.

## Links

- [CriticMarkup](http://criticmarkup.com) — The syntax foundation, created by Gabe Weatherhead and Erik Hess
- [GitHub](https://github.com/hackerbara/changetracks) — Source, issues, discussions
