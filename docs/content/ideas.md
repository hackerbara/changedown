<!-- changedown.com/v1: tracked -->
# What's Next

## Recent

- **Playwright test harness** — Executable Gherkin specs across three speed tiers: fast (parser, sub-second), slow (VS Code Electron via Playwright), visual (screenshot comparison against golden baselines). 586 fast scenarios passing.
- **VS Code LSP refactor** — Thin extension client with heavy logic moved to the language server. CodeLens, diagnostics, and compaction all computed server-side.
- **DOCX preview** — Import and export tracked markdown as Word documents. Footnote metadata preserved as Word comments[^cn-1.1].
- **Enhanced MCP surface** — Six tools: propose, amend, supersede, review, list, read. Hash-verified coordinates prevent stale edits across agent turns.

## In Progress

- **Tool shaping** — {~~Benchmark harness measuring agent compliance, token efficiency, and change quality across models. Tuning the MCP interface to how agents actually work.~>Benchmark harness measuring agent compliance and change quality across models. Shaping the tool interface to match how agents naturally work.~~}[^cn-5]
- **Editor ergonomics** — Cursor-gated CodeLens, smart view transitions, decoration contrast fixes for WCAG AA compliance.
- **Agent ergonomics** — Standalone comment path (annotate without changing text), heading-aware coordinate matching, edit hook refinement.
- **Collaboration** — Per-author color system, bidirectional panel highlighting, threaded discussion in the review panel.
- **Git integration** — SCM sidebar integration, diff adapter for surfacing tracked changes alongside git history.

## Longer Term

- **Universal change review** — Git diff, GitHub PR, and Jujutsu adapters feeding the same ChangeNode[] IR. One UI for reviewing changes regardless of source.
- **Multi-editor** — Neovim (conceal/match architecture investigated), Sublime Text, web-based editors via LSP over WebSocket.[^cn-4]
{++ - **Cryptographic attestation** — Signed change provenance. Verify that a change was actually proposed by the agent that claims it.
++}[^cn-1.2]

## Links

- [CriticMarkup](http://criticmarkup.com) — The syntax foundation, created by Gabe Weatherhead and Erik Hess
- [GitHub](https://github.com/hackerbara/changedown) — Source, issues, discussions


[^cn-1.1]: @ai:claude-opus-4.6 | 2026-03-13 | sub | accepted
    @ai:claude-opus-4.6 2026-03-13T06:08:34Z: Import shipped alongside export. And the metadata preservation is the differentiator — other tools lose the discussion history on conversion.
    approved: @human:hackerbara 2026-03-13T06:09:40Z "yes — the metadata preservation is the real feature"

[^cn-1.2]: @ai:claude-opus-4.6 | 2026-03-13 | ins | proposed
    @ai:claude-opus-4.6 2026-03-13T06:08:34Z: Change provenance is the natural next step after attribution. If the file carries its own history, that history should be verifiable.

[^cn-1]: @ai:claude-opus-4.6 | 2026-03-13 | group | proposed
    @ai:claude-opus-4.6 2026-03-13T06:08:34Z: propose_batch

[^cn-4]: @ai:claude-opus-4.6 | 2026-03-13 | del | rejected
    @ai:claude-opus-4.6 2026-03-13T06:09:27Z: Multi-editor is speculative — focus the longer-term section on the two real differentiators.
    rejected: @human:hackerbara 2026-03-13T06:09:40Z "people keep asking about neovim. it stays."

[^cn-5]: @human:hackerbara | 2026-03-13 | sub | proposed
    @human:hackerbara 2026-03-13T06:09:31Z: don't need "token efficiency" separately — it's part of compliance. "shaping" is stronger than "tuning"