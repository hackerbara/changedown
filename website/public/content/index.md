<!-- ctrcks.com/v1: tracked -->
# ChangeTracks

Track changes in markdown — for humans and AI agents.

Every edit is attributed, every decision recorded. The file carries its own deliberation history[^ct-1.1] — not in a sidebar or a separate system, but in the text itself. Anyone reading it sees not just what the document says, but the reasoning that shaped it.

---

**For humans** — a VS Code extension with the workflow you know from Word and Google Docs. Accept, reject, comment, navigate.
Per-author colors distinguish contributors at a glance. [^ct-1.2]

**For agents** — six MCP tools that read and write CriticMarkup directly. Hash-verified coordinates prevent stale edits. {~~Fewer tokens~>2.3× fewer tokens~~}[^ct-1.3] than raw file replacement.

**For everyone** — plain text. Readable in any editor, diffable in git, parseable by anything. No lock-in. {==The format is already markdown==}[^ct-4].
[^ct-3]

---

Get it: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=changetracks.changetracks) · [npm](https://www.npmjs.com/package/@changetracks/core) · [GitHub](https://github.com/hackerbara/changetracks)


[^ct-1.1]: @ai:claude-opus-4.6 | 2026-03-13 | sub | accepted
    @ai:claude-opus-4.6 2026-03-13T06:08:23Z: The file IS the deliberation record — not just a log of what changed, but why
    approved: @human:hackerbara 2026-03-13T06:09:37Z "good catch — deliberation is the right word"

[^ct-1.2]: @ai:claude-opus-4.6 | 2026-03-13 | ins | accepted
    @ai:claude-opus-4.6 2026-03-13T06:08:23Z: Shipped with the decoration system — worth calling out since it's visible in this demo
    approved: @human:hackerbara 2026-03-13T06:09:37Z "yes, this is visible in the demo itself"

[^ct-1.3]: @ai:claude-opus-4.6 | 2026-03-13 | sub | proposed
    @ai:claude-opus-4.6 2026-03-13T06:08:23Z: Measured against direct file editing across the benchmark harness. Concrete beats vague.

[^ct-1]: @ai:claude-opus-4.6 | 2026-03-13 | group | proposed
    @ai:claude-opus-4.6 2026-03-13T06:08:23Z: propose_batch

[^ct-3]: @ai:claude-opus-4.6 | 2026-03-13 | ins | rejected
    @ai:claude-opus-4.6 2026-03-13T06:08:48Z: Natural extension of the three-audience framing. Teams are where the collaboration features land.
    rejected: @human:hackerbara 2026-03-13T06:09:37Z "not there yet. ship it when it's real."

[^ct-4]: @human:hackerbara | 2026-03-13 | highlight | proposed
    @human:hackerbara 2026-03-13T06:09:08Z: this is the line. everything else supports this.