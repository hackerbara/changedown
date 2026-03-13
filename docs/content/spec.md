<!-- ctrcks.com/v1: tracked -->
# The Format

ChangeTracks builds on [CriticMarkup](http://criticmarkup.com), a plain-text syntax for editorial markup created by Gabe Weatherhead and Erik Hess in 2013. Five inline constructs cover the full editorial vocabulary[^ct-1.1].

## Syntax

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `{++text++}` | {++added this++} |
| Deletion | `{--text--}` | {--removed this--} |
| Substitution | `{~~old~>new~~}` | {~~before~>after~~} |
| Highlight | `{==text==}` | {==highlighted==} |
| Comment | `{>>text<<}` | {>>a note<<} |

Any markdown file with these constructs is a valid CriticMarkup document. ChangeTracks adds a metadata layer on top.

## Metadata Levels

**Level 0** — Bare CriticMarkup. No attribution. Just the change.

`{++added this++}`

**Level 1** — Inline metadata appended after the closing delimiter. Author, date, status.

`{++added this++}{>>@ai:claude-opus-4.6 2026-03-12 proposed<<}`

**Level 2** — Footnote references linking to full discussion blocks. Author identity, timestamps, status lifecycle, amendment history, and threaded deliberation. This is what the MCP tools produce and what the review panel displays.
{++

```
[^ct-1]: @ai:claude-opus-4.6 | 2026-03-12 | ins | accepted
    @ai:claude-opus-4.6 2026-03-12T14:30:00Z: Added for clarity
    approved: @human:hackerbara 2026-03-12T15:00:00Z "good addition"
```
++}[^ct-1.2]

{==The footnote block is the deliberation record.==}[^ct-4] It stays with the file — not in a PR comment, not in a Slack thread, not in a separate review system. When someone reads the file six months later, the context is still there.

## Views

Three projections of the same file:

- **Changes** — The working view. Markup rendered as colored inline decorations, delimiters hidden, gutter shows where edits are.
- **Agent** — Everything visible. Raw delimiters, hash coordinates, footnotes. What an AI agent sees when it reads the file.
- **Final** — Clean prose. All accepted changes applied, rejected changes removed. The document as it reads when deliberation is done.


[^ct-1.1]: @ai:claude-opus-4.6 | 2026-03-13 | sub | accepted
    @ai:claude-opus-4.6 2026-03-13T06:08:30Z: Credit the creators. CriticMarkup is their work — we build on it.
    approved: @human:hackerbara 2026-03-13T06:09:38Z "absolutely — their format, their credit"

[^ct-1.2]: @ai:claude-opus-4.6 | 2026-03-13 | ins | proposed
    @ai:claude-opus-4.6 2026-03-13T06:08:30Z: Show don't tell — a concrete footnote example makes the three levels immediately clear

[^ct-1]: @ai:claude-opus-4.6 | 2026-03-13 | group | proposed
    @ai:claude-opus-4.6 2026-03-13T06:08:30Z: propose_batch

[^ct-4]: @human:hackerbara | 2026-03-13 | highlight | proposed
    @human:hackerbara 2026-03-13T06:09:24Z: this is what we add to CriticMarkup. this paragraph is the whole pitch for L2.