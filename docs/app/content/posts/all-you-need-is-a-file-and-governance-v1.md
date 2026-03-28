<!-- ctrcks.com/v1: tracked -->
# All You Need Is a File and Governance

Everyone building AI tools right now is circling the same question: how do humans and agents collaborate on documents?

The answers are multiplying. Skills frameworks. Databases. CRDTs for real-time sync. Beautiful new editors and agent development environments. The UX will continue to evolve and flourish — and it should.

But underneath all of it, something is missing. When an AI agent edits your document, you get a diff. You can see what changed. You can't see why. You can't see who proposed it, who approved it, whether anyone pushed back, what alternatives were considered. That context lives in chat logs, in PR comments, in your memory — scattered across tools that don't talk to each other. The next person who opens the file gets the final text and nothing else.

We need an interchange format. Not another tool — a format. A way to say "here are my changes, here's why, here's who" that works in any editor, any workflow, any tool. Something you can email, put in a pull request, open in Notepad.

That's what ChangeTracks is. An open format that puts track changes — the kind you'd use in Word — directly into plain text files. CriticMarkup for the editing operations. Footnotes for the governance log. And smart tooling that makes adherence the path of least resistance.

## Intent in the character stream

Humans and agents already think in editing operations. A human making tracked changes in Word is composing insertions, deletions, and substitutions with specific purposes — not character-level real-time maps. An LLM proposing changes defaults to old_text/new_text and gives reasons in commit messages or responses. Both are thinking at the same level: writing and changing the words, with reasons attached.

ChangeTracks writes this down in the file. An insertion: `{++new text++}`. A deletion: `{--removed text--}`. A substitution: `{~~old~>new~~}`. These are CriticMarkup delimiters — an existing open standard. Below the document body, a footnote log records who, when, why, and what decision was made about each change:

```
[^ct-1]: @alice | 2026-03-15 | sub | proposed
    reason: Clearer terminology for the API audience
    approved: @bob 2026-03-16 "Agreed, reads better"
```

The file carries its own history. No database. No sidecar service. The characters in the file are the protocol. Any text editor can read it. Git diffs it naturally. And when the format needs to travel to Word or back, the round-trip is a first-class concern — because interchange is the whole point.

## Building a forum, not a panopticon

A file on a disk is a physical thing with physical properties. It can be put in a folder and taken out. Emailed, attached to a PR, zipped and archived. The person who holds the file decides who sees it and when. Participants have agency over what the system knows about their work.

This matters more than it sounds.

Any approach that stores change history in a service or database — however well-intentioned — builds the architecture of total surveillance first, and then attempts to offer promises of removal after the fact. The architecture is the panopticon. The privacy controls are the curtains on the windows.

A file lets you choose how you participate. You can carry an entire deliberation history — every proposal, every review, every thread of discussion. Or you can compact that history down to a clean document with a one-line boundary marker that says who compacted and when. The deliberation is gone; the attribution remains. You choose the depth. The format supports arbitrary amounts of backstory or polished presentation.

This is the physics of interchange: forgettability, modifiability, ownership, auditability — all properties of the file itself, not permissions granted by a service. The question isn't "does the system let me delete my history." The question is "do I hold the file."

The design test we use: design every feature so a good-faith newcomer feels oriented, and a bad-faith manager feels friction. Compaction is stewardship, not scorekeeping. Footnotes are handrails, not scarlet letters. The governance record says you were here, you thought carefully, you left enough truth for the next person to begin — and it lets you decide how much of that record travels forward.

## Better for humans

Content professionals have twenty years of muscle memory with Word Track Changes. Legal redliners, copy editors, journal reviewers, policy writers — they know this workflow in their hands. ChangeTracks maps directly to that muscle memory: insertions underlined, deletions struck, comments in the margin, accept and reject with a click. The VS Code extension renders CriticMarkup into the same visual language, and the format round-trips to .docx for teams that need to move between worlds. No new concepts to learn. Just a new medium that happens to be plain text.

And because the changes live in the text, humans can read AI work directly. Not a diff behind a tool response. Not a binary transformation you have to trust. The actual proposed words, visible in context, with the agent's reasoning attached in a footnote you can read without switching windows. When an agent proposes changing "REST" to "GraphQL" and explains "reduces N+1 query problem" in the footnote, you're reading a collaborator's work — not auditing a black box.

## Better for agents

Here's the thing about AI agents: they read raw files. You can skill them and harness them and build elaborate tool surfaces — and they'll still read the file directly when it suits them. State has to live in the world, not in instructions they might forget.

ChangeTracks puts state in the world. The editorial history is in the bytes. An agent reads the file and gets the full picture — who proposed what, who approved it, what's still pending — without a separate tool call. The footnotes are right there. The format is the context.

And when agents write, the cognitive shape fits. Batched editing operations — "here are twelve changes to this document, with reasons" — match how language models naturally process revision. Not character-level keystroke replay. Not complex key-value structures. Markdown changes with reasons attached, expressed in the same CriticMarkup they read in the file. The read surface and the write surface are two halves of one gesture.

We measured this directly. On a 169-line document with 32 seeded errors, the same model using ChangeTracks completed the task in 3 tool calls and 46 seconds. Raw file editing took 25 calls and 173 seconds. Eight times fewer calls. Three times faster. Same quality. The difference wasn't the model — it was the harness.

## The format

The interchange format is deliberately simple:

- **CriticMarkup delimiters** for inline editing operations — five types covering insertion, deletion, substitution, highlight, and comment.
- **An append-only footnote log** carrying author, date, type, status, review decisions, discussion threads, and reasoning for every change.
- **Content-addressed line coordinates** (LINE:HASH) that let tools point at specific lines with a two-character fingerprint — validating freshness and rejecting stale edits instead of silently corrupting the document.

The result is diffable, mergeable, gittable, and human-readable. It works without any special tools — the markup is visible in any text editor. And when you add tooling, the experience gets richer without the format getting more complex.

Complexity is always going to happen. Documents accumulate changes, review threads grow, editorial history deepens. The question is where that complexity lives. In a database you can't see? In a service you don't control? Or in the text, where you can read it, search it, diff it, and compact it when it's no longer serving you?

We chose the text.

## What this means

The question everyone is asking — how do humans and agents collaborate on documents — has a simpler answer than most approaches suggest. You don't need a CRDT. You don't need a database. You don't need a service that promises to forget.

You need a file. And you need governance in that file.

The rest is tooling.
