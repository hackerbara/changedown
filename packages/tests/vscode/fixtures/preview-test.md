# Preview Renderer Test Fixture

## Basic Changes

This has an {++insertion++} in the text.

This has a {--deletion--} in the text.

This has a {~~substitution~>replacement~~} in the text.

This has a {==highlight==} in the text.

This has a comment{>>This is the comment text<<} inline.

## Status-Aware (with footnotes)

Added paragraph.{++New content here.++}[^cn-1]

Removed paragraph.{--Old content here.--}[^cn-2]

Changed wording.{~~original phrasing~>better phrasing~~}[^cn-3]

## Code Fence Handling

```python
# CriticMarkup in code should be styled
def greet():
    return {~~"hello"~>"hi there"~~}
```

```changedown
# This should render as literal text, not styled
{++This is an example of insertion syntax++}
{--This is an example of deletion syntax--}
```

## Multiple Changes in One Line

The {~~Acme Corp~>TechCorp~~} announced {++today++} that it will {--shut down--}{++continue++}.

## Footnote Definitions

[^cn-1]: @alice | 2026-02-17 | insertion | proposed
  Added new content for the release notes.

[^cn-2]: @bob | 2026-02-17 | deletion | proposed
  Removed outdated information.

[^cn-3]: @alice | 2026-02-17 | substitution | accepted
  Improved clarity of the original phrasing.
