<!-- changedown.com/v1: tracked -->
# Changedown

Track changes in markdown — for humans and AI agents.

Collaboration needs a **portable interchange format**: intent and review history live in the character stream, not in chat logs, PR comments, or proprietary UIs. State lives in the world, whoever holds the file can verify what was proposed, reviewed, and decided without asking a service for a second, hidden source of truth; participation, privacy, and how control can be exercised or resisted all follow from that. [*For collaboration, a file format is all you need*](/content/posts/01-for-collaboration-a-file-format-is-all-you-need#for-collaboration-a-file-format-is-all-you-need) develops the argument from interchange through agency and trust.

Changedown is that layer — CriticMarkup for edits, markdown footnotes for deliberation — so the file stays plain text, diffable in git, and readable in any editor.

**Humans** — A VS Code extension with the workflow you know from Word: accept, reject, comment, navigate; discussion stays next to the text.

**Agents** — Six MCP tools with hash-stable coordinates. In early benchmarking (169-line document, 32 seeded errors, Claude Sonnet), Changedown completed the task in **3 tool calls** versus **25** for raw file editing, same reported quality — methodology and tables in [*How Changedown is benchmarked*](https://github.com/hackerbara/changedown/blob/main/docs/public/how-changetracks-is-benchmarked.md#the-headline-task8-deep-copy-edit).

**This site** — You can try the editor with docx import/export in the browser; it is a rough demo **with bugs**. For real work, use the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=changedown.changedown).

---

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=changedown.changedown) · [npm](https://www.npmjs.com/package/@changedown/core) · [GitHub](https://github.com/hackerbara/changedown)

**Read more** — [Install](/content/03-install) · [Format spec](/content/04-spec) · [About this site](/content/06-about-site) · [Ideas & roadmap](/content/07-ideas) · [Editing example](/content/02-editing-example) · [For collaboration, a file format is all you need](/content/posts/01-for-collaboration-a-file-format-is-all-you-need#for-collaboration-a-file-format-is-all-you-need)
