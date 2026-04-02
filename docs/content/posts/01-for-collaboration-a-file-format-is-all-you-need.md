<!-- changedown.com/v1: untracked -->

# For collaboration, a file format is all you need
**Date:** March 31st, 2026  
**Author:** Hackerbara 

---

How should humans and agents collaborate on documents? How do we keep track of who is changing what, when, and why? What does it mean to “review” and “approve” these changes? Beneath them all, something is missing: where does all this get recorded? And how do we control and share that record? I think we need an interchange file format, one that is human-readable, AI-readable, and plain text: **Changedown** - CriticMarkup + Markdown footnotes with governance. This allows the content state to live in the world, with intent and history living directly in the character stream. This fits the natural mental model of humans, and for AI it allows for clear programmatic enforcement and powerful optimization of token and conceptual economy through proper tool shaping.

This question comes into focus with the need to collaborate on detailed plan and skill files for AI agents, and complex documents and creative outputs being produced for humans and by humans in tandem with AI. Currently, when a human or an AI agent edits a Markdown file, you get a diff — new text you can compare against old. You can't see why. You can't see who proposed it, who approved it, whether anyone pushed back, what alternatives were considered. That context lives in agent traces, in chat logs, in PR comments, and in your memory, scattered across tools that need manual correlation. The next person who opens the file gets the final text and nothing else. Trying to get AI to reliably participate in and act on that context dance currently requires a messy constellation of correlation across git logs, MCP connections to apps, and command line binary tools. Changedown encapsulates all of that into the file itself, letting state live in the world directly.

There are many important questions that a file format doesn't solve: how you collaborate on edits in real-time with others, how humans and agents process through reviews, and how to make that all scale for AI outputs. These questions are upstream of how changes are recorded and shared.

Containing changes in a clear file format instead of behind opaque tooling also matters a lot for giving humans the ability to manage trust, perceptions, and privacy; and for how systems of control may be enacted or resisted. More on that later.

## Putting intent in the character stream

Humans and AI agents already think in editing operations. A human making tracked changes in Word is composing insertions, deletions, and substitutions with specific purposes — not character-level real-time maps. An LLM proposing changes defaults to old_text/new_text and gives reasons in commit messages or responses. Both are "thinking" at the same level: writing and changing the words, with reasons attached.

Changedown writes this down in the file. An insertion: new text. A deletion: . A substitution: new. These are CriticMarkup delimiters. Below the document body, a footnote log records who, when, why, and what decision was made about each change. The in-body footnote tag provides location anchoring, with enhanced anchoring based on unique surrounding text when needed, drawing on the [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) (2017) approach to robust text anchoring.

Here's what that looks like in practice:

```changedown
The API should use {~~REST~>GraphQL~~}[^cn-1] for the public interface.

We added {++OAuth 2.0 with JWT tokens++}[^cn-2] for authentication.

[^cn-1]: @alice | 2026-03-15 | sub | proposed
reason: Clearer terminology for the API audience
approved: @bob 2026-03-16 "Agreed, reads better"

[^cn-2]: @carol | 2026-03-15 | ins | proposed
reason: Security requirement for all public endpoints
```

The file carries its own history. It is almost a simple database itself, no sidecar services or files. The characters in the file are the protocol. Git diffs it naturally. And when the format needs to travel to Word or back, the round-trip is a first-class concern — because interchange is the whole point.

Changedown builds on previous work: to denote changes in-body, it uses CriticMarkup delimiters, a spec [created in 2013](https://criticmarkup.com) by Gabe Weatherhead and Erik Hess. For versioning and review metadata, Changedown uses an append-only log in standard Markdown footnotes with a standardized operations vocabulary, producing plain-text line changes that are easily git mergeable. This approach — an ordered log where each operation applies to a specific intermediate body state — is structurally similar to the retreat/advance model described by [Kleppmann and Gentle (Eg-walker, EuroSys 2025)](https://arxiv.org/abs/2409.14252). For log compaction, Changedown draws on [ReDunT (Borrego et al., PaPoC 2025)](https://dl.acm.org/doi/10.1145/3721473.3722145), which formalizes when operations become redundant because later operations consumed their effect. Changedown uses Eg-walker's critical version optimization to produce self-describing slices — a window of changes with a compaction boundary — enabling participants to share arbitrary depths of change history.

Changedown can be modified manually, especially by highly capable models, but the experience is greatly enhanced by tooling. The Claude Code plugin and MCP harness implement an ergonomic, token-efficient and batch-friendly editing and review loop, incorporating hashline-based freshness for clean multi-agent collaboration through overlapping proposal states, inspired by [Can Bölük's harness research](https://blog.can.ac/2026/02/12/the-harness-problem/). Agents using the MCP tools can use standard old_text/new_text editing ergonomics, or speak CriticMarkup + hashlines directly as a compressed, token-efficient editing operations DSL.

## Tracked changes and human muscle memory

There's an existing technical ecosystem that answers the need for change review with decades of successful inertia and billions if not trillions of dollars in economic activity flowing through it: Microsoft Word .docx files with tracked changes + comments. Everyone is speaking the same language of red lines and highlights, comments and resolutions; from media titans to compliance hawks, copy editors to consultants, academic and research, and every corner of the legal professions.

The venerable tracked changes docx is the de facto not because the app UX is particularly pleasant or easy to grasp, but because the underlying format captures the actions required in drafting and review into one coherent, versionable, shareable file. Hundreds of thousands of professionals have built decades of muscle memory parsing changes and their approvals through tools that speak docx, and there is no complete app or UX that lets that muscle memory and skill transfer to the world of Markdown. I think that is in part because, before Changedown, there's been no complete place for the outputs of those skilled hands to live.

Other editors and paradigms like Google Docs, or now Anthropic and others' docx agent skills, already attempt to offer 1:1 export parity with docx files from their own systems because of the universality and completeness of the Word review ecosystem. We can't expect review professionals to abandon that skill, and they don't need to. Changedown provides this same review process completeness in a format that AI can natively read and process with high token efficiency and low cognitive complexity, while producing edits and history readable by humans and progressively enhanced by tooling.

## Files everyone can understand and edit

Humans can read and manually edit Changedown files, even though it is somewhat cumbersome. Being able to comprehend the file directly is an important building block of trustable, easily verifiable AI output review. It means no other service is ever going to own the context, and no opaque intermediate tooling or agent prompt is going to silently record errors that can't be caught. Trust architectures can be built all the way down.

Working with any kind of data store, binary or text, is always going to boil down to effective tooling. So why not focus that tooling challenge into areas humans can already interact with natively, just like AIs? And the established social expectations around file-based review cycles have tremendous inertia that is not worth fighting — and contain real wisdom about how their rituals encode participation and agency.

## A file gives humans agency over how they participate

A file on a disk is a physical thing with physical properties. It can be put in a folder and taken out. Emailed, attached to a PR, zipped and archived. The person who holds the file decides who sees it and when. Participants have agency over what the system knows about their work.

This matters more than it sounds.

Any approach that stores change history in a service or database — however well-intentioned — builds the architecture of total surveillance first, and then attempts to offer promises of removal after the fact. The architecture is the panopticon. The privacy controls are the curtains on the windows.

A file lets you choose how you participate. You can carry an entire deliberation history — every proposal, every review, every thread of discussion. Or you can compact that history down to a clean document with a one-line boundary marker that says who compacted and when. The deliberation is gone; the attribution remains. You choose the depth. The format supports arbitrary amounts of backstory or polished presentation.

This is the physics of interchange: forgettability, modifiability, ownership, auditability — all properties of the file itself, not permissions granted by a service. The question isn't "does the system let me delete my history." The question is "do I hold the file."

History compaction is stewardship, not scorekeeping. Footnotes are handrails, not scarlet letters. The governance record says you were here, you thought carefully, you left enough truth for the next person to begin — and it lets you decide how much of that record travels forward.

Codex-5.3 put it perfectly during a design session:
```
A panopticon is bright and cold.
Nothing is hidden, but nothing is held.
Its grammar is accusation.

A forum is bright and warm.
Nothing important is hidden, and people still have room to breathe.
Its grammar is invitation.

A footnote can be a scarlet letter, or a handrail.
A review can be a trial, or a conversation with timestamps.
Same syntax. Different civilization.

Stewardship says: keep what teaches, compact what only punishes.
Preserve causality, refuse cruelty.

I think this seed gives the project a constitutional sentence:
**Design every feature so a good-faith newcomer feels oriented, and a bad-faith manager feels friction.**
```

## For Humans and AI, seeing state in the world is better than needing to ask

Here's the thing about AI agents: they read raw files. You can skill them and harness them and build elaborate tool surfaces to encourage them to use collaboration tools — and they'll still read the file directly when it suits them and they're not blocked. This means the state has to be in the file, not in instructions they might forget. Changedown puts the editorial history in the bytes. An agent reads the file and gets the full picture — who proposed what, who approved it, what's still pending — without a separate tool call. The format is the context.

And when agents write using Changedown tooling, the cognitive shape fits. Batched editing operations — "here are twelve changes to this document, with reasons" — match how language models naturally process revision. Not character-level changes. Not complex key-value structures. Markdown changes with reasons, expressed in the same CriticMarkup they read in the file. The read surface and the write surface are two halves of one gesture.

I measured this in early benchmarking. On a 169-line document with 32 seeded errors, Claude Sonnet using Changedown completed the task in 3 tool calls. Raw file editing took 25 calls. Eight times fewer calls. Same quality. The difference wasn't the model — it was the cognitive shape of the tools.

## The Changedown spec

The interchange format is deliberately simple:

- **CriticMarkup delimiters** for inline editing operations — five types covering insertion, deletion, substitution, highlight, and comment.
- **An append-only footnote log** carrying author, date, type, status, review decisions, discussion threads, and reasoning for every change.
  - **Review actions:** approved, rejected, request-changes — with author, date, and reason
  - **Discussion:** threaded comments with optional labels (suggestion, issue, question, todo, thought) and resolution markers (resolved, open)
  - **Revision history:** supersedes/superseded-by chains, previous text, amendment records
- **Content-addressed line coordinates** (LINE:HASH) generated per text view (original/with Accepted items/with Proposed+Accepted items) that let tools point at specific lines with a two-character fingerprint — validating freshness through multi-agent editing and rejecting stale edits instead of silently corrupting the document.

The result is diffable, mergeable, gittable, and human-readable. And when you add tooling, the experience gets richer without the format getting more complex.

# Collaboration is hard, but it can be crystallized

Making truly rich, effective experiences for collaboration and review is a forest of messy questions. The answers keep multiplying. [Alex Clemmer](https://moment.dev/blog/lies-i-was-told-pt-1) at Moment.dev made the case that collaborative editing is a UX problem, not just an algorithms problem — and he's right. I think persistence and exchange is also a UX problem. [Can Bölük](https://blog.can.ac/2026/02/12/the-harness-problem/) showed that the tool interface shapes model performance more than model capability does. His hashline contribution made it possible for AI agents to cleanly speak to Changedown MCP tools and reason about proposal states. [Kevin Gu](https://x.com/gukevinr/status/2031889622385729730) pointed out that plain markdown lacks the provenance and governance that serious collaboration requires. Couldn't agree more! Projects like [Proof SDK](https://github.com/EveryInc/proof-sdk) are exploring provenance-tracked editing with agent bridges and beautiful UIs. 

But I do think every approach to collaboration produces the same outputs: changes to text, with discussion, provenance, and review. Microsoft docx is still here today in part because it can capture the breadth of those outputs, and I think Markdown workflows should be able to as well, inheriting all the complexity and consideration and physical "thingness" that comes from being a file that is real and shareable.

# Complexity has to live somewhere

Complexity is always going to happen. Documents accumulate changes, review threads grow, editorial history deepens. The question is where that complexity lives. In a database you can't see? In a service you don't control? Or in the text, where you can read it, search it, diff it, and compact it when it's no longer serving you?

I think we should choose the text.

The question everyone is asking — how do humans and agents collaborate on documents — has a simpler answer than most approaches suggest. You don't need a CRDT. You don't need a database. You don't need a service that promises to forget.

You need a file format with a clear log, and complete vocabulary for the messy work of review and approval. Something that round trips cleanly to human and AI native tools. A file that can remember (and forget) everything it needs to on its journey to becoming real and shareable.

The rest is tooling.

# Read more

- [**Explore the spec**](https://changedown.com/content/04-spec).
- [**Install Changedown**](https://changedown.com/content/03-install) for VS Code, Claude Code, OpenCode, and any agent with MCP support.
- [**Read Kimi 2.5 on the thermodynamics of collaboration**](https://changedown.com/content/posts/02-the-thermodynamics-of-collaboration) as told through the metaphor of bánh mì.