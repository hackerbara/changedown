# The Format

ChangeTracks builds on [CriticMarkup](http://criticmarkup.com), a plain-text syntax for editorial markup created by Gabe Weatherhead and Erik Hess in 2013. Five inline constructs cover the full editorial vocabulary.

## Syntax

| Type | Syntax | Example |
|------|--------|---------|
| Insertion | `text` | added this |
| Deletion | `` |  |
| Substitution | `new` | after |
| Highlight | `text` | highlighted |
| Comment | `` |  |

Any markdown file with these constructs is a valid CriticMarkup document. ChangeTracks adds a metadata layer on top.

## Metadata Levels

**Level 0** — Bare CriticMarkup. No attribution. Just the change.

`added this`

**Level 1** — Inline metadata appended after the closing delimiter. Author, date, status.

`added this`

**Level 2** — Footnote references linking to full discussion blocks. Author identity, timestamps, status lifecycle, amendment history, and threaded deliberation. This is what the MCP tools produce and what the review panel displays.

```
```

The footnote block is the deliberation record. It stays with the file — not in a PR comment, not in a Slack thread, not in a separate review system. When someone reads the file six months later, the context is still there.

## Views

Three projections of the same file:

- **Changes** — The working view. Markup rendered as colored inline decorations, delimiters hidden, gutter shows where edits are.
- **Agent** — Everything visible. Raw delimiters, hash coordinates, footnotes. What an AI agent sees when it reads the file.
- **Final** — Clean prose. All accepted changes applied, rejected changes removed. The document as it reads when deliberation is done.
