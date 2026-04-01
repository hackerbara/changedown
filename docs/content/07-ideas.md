<!-- changedown.com/v1: untracked -->
# Recently landed

- **DOCX Rountrip** — Bi-directional docx support for Changedown docs. Uses the arbitrary metadata preservation feature of Changedown to cleanly round trip image rich positioning & sizing, MathML formulas.
- **Website & Editor Host Refactoring** - Made the website an SPA that extracts key parts of the Monaco/VS Code extension, refactoring some of the document state and editor & decorator model in the process.
- **LLM-Jail** - More aggressive sandboxing of Claude Code agents with detection of basic sed/python/bash file read escapes from tracking enforcement.
- **Projected-text VS Code** - VS Code editor now works in the projected/working text space with full unique anchors, removing delimiter characters from body text to allow for better word wrap handling and change show/hide.


# In progress

- **Deeper batch edit tool shaping** — Benchmark harness measuring agent compliance and change quality across models. Shaping the tool interface to match how agents naturally work.
- **VS Code editor ergonomics** — Deeper review actions and threaded discussion in the review panel, comments, and other surfaces. Cleaner UX for reattaching unresolved edit anchors.
- **Agent ergonomics** — Better MCP surface for deep review actions and file/project tracking state awareness. Clearer agent hospitality post tool blocking.
- **Developer SDK** - Refine/refactor various parts of codebase and produce a more coherent developer starting experience.


# Longer term iteas

- **Cryptographic attestation** — Signed change provenance. Verify that a change or review was actually done by the author that claims it. I am not a cryptographer though and neither is Claude lol.
- **Universal change review** — Git diff, GitHub PR, and Jujutsu adapters feeding the same ChangeNode[] IR. One UI for reviewing changes regardless of source, with perfect Changedown export.
- **Enhanced Multi-editor support** — Website is POC for web-based editors via LSP over WebSocket, but how different editor ecosystems and their various metaphors can best supported is an ongoing question.


# Links

- [CriticMarkup](http://criticmarkup.com) — The syntax foundation, created by Gabe Weatherhead and Erik Hess
- [GitHub](https://github.com/hackerbara/changedown) — Source, issues, discussions