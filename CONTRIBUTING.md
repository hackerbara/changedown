<!-- changedown.com/v1: tracked -->
# Contributing to ChangeDown

## Bug Reports with Tests Get Prioritized

The fastest way to get a bug fixed is to submit a failing test alongside your report. A test that reproduces the bug removes all ambiguity about what's broken and gives maintainers a clear target.

Bug reports without tests are welcome, but reports with a reproducible Gherkin scenario move to the front of the queue.

## Understanding Gherkin (the test format)

ChangeDown tests are written in [Gherkin](https://cucumber.io/docs/gherkin/reference/), a structured specification language used by [Cucumber](https://cucumber.io/). The project follows [Paul Duvall's ATDD two-tier model](https://www.paulmduvall.com/atdd-driven-ai-development-how-prompting-and-tests-steer-the-code/) — behavioral specs in Gherkin, edge-case matrices in native test files.

**The critical thing to understand:** each `Given`, `When`, and `Then` line in a Gherkin scenario must exactly match a registered step definition in the codebase. You cannot write arbitrary English. The test runner pattern-matches your lines against step definitions — if nothing matches, the test fails with "undefined step."

This does **not** work:

```gherkin
# WRONG — no step definition matches these lines
Scenario: Parser fails on unclosed markup
  Given I have a document with an unclosed insertion tag
  When the parser runs
  Then it should handle it gracefully
```

This **does** work (each line matches an existing step definition):

```gherkin
# CORRECT — every line matches a registered step
Scenario: Parser handles unclosed insertion
  Given the input text is:
    """
    Hello {++world there
    """
  When I parse the text
  Then the parser finds 0 changes
```

The difference: the second example uses exact step patterns (`Given the input text is:`, `When I parse the text`, `Then the parser finds {int} change(s)`) that are registered in the step definition files.

## Writing a Bug Report Test

### 1. Find existing step definitions

Before writing a scenario, search for available steps. Every `Given`/`When`/`Then` line you write must match one of these:

```bash
# Parser and core logic steps
grep -n "Given\|When\|Then" packages/tests/vscode/features/steps/parser.steps.ts
grep -n "Given\|When\|Then" packages/tests/vscode/features/steps/operation.steps.ts

# Search all step files for a keyword
grep -rn "cursor\|offset" packages/tests/vscode/features/steps/
grep -rn "document\|text" packages/tests/features/steps/
```

Step definitions live in two places:
- `packages/tests/features/steps/` — core, engine, and MCP steps
- `packages/tests/vscode/features/steps/` — VS Code extension steps

### 2. Common step patterns

These steps are available and cover most bug report scenarios:

**Setup:**
- `Given a document with text "..."` — inline document
- `Given a document with text:` + doc string — multi-line document
- `Given the input text is:` + doc string — parser-level input
- `Given the cursor is at offset {int}` — position cursor

**Actions:**
- `When I parse the text` — run the parser
- `When I accept the change at the cursor` / `When I reject the change at the cursor`
- `When I accept all changes in the document` / `When I reject all changes in the document`

**Assertions:**
- `Then the document text is "..."` / `Then the document text is:` + doc string
- `Then the parser finds {int} change(s)`
- `Then change {int} is a/an {word}` — checks type (insertion, deletion, substitution, highlight, comment)
- `Then change {int} has modified text "..."` / `Then change {int} has original text "..."`
- `Then change {int} has comment "..."`
- `Then change {int} range starts at {int}` / `Then change {int} range ends at {int}`

### 3. Write your scenario

Tag it `@fast` (parser/logic, no VS Code launch) or `@slow` (needs VS Code). Add `@wip` so it's excluded from the main suite:

```gherkin
@fast @wip
Feature: PB-XX — Description of the bug

  Scenario: Describe the incorrect behavior
    Given a document with text "Hello {++world++}{++again++} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello world{++again++} there"
```

### 4. Run it and capture the output

```bash
# Fast tier (parser/core — runs in <1 second)
cd packages/tests/vscode && npm run test:fast

# Run a single scenario by name
cd packages/tests/vscode && npx cucumber-js \
  --config features/cucumber.mjs \
  --name 'Describe the incorrect behavior'

# Slow tier (launches VS Code — takes 30+ seconds)
cd packages/tests/vscode && npm run test:slow -- --tags '@wip'
```

### 5. Submit in your issue

Paste into your GitHub issue:
1. The scenario text (in a code block with `gherkin` syntax highlighting)
2. The test output showing the failure
3. A sentence describing expected vs actual behavior

A maintainer will move the scenario into the repo, verify it fails, and implement the fix.

## What a Good Bug Issue Looks Like

- Clear title describing the broken behavior
- The Gherkin scenario (using existing step definitions)
- Test output showing the RED failure
- Expected vs actual behavior in one sentence
- Version/commit you tested against

## Security Requirements

ChangeDown is an AI-agent-facing tool. Scenarios and test data are processed by AI agents during development and review. All submissions are reviewed against these requirements:

### No prompt injection in test content

Gherkin scenario descriptions, step text, and doc strings must not contain instructions aimed at AI agents. Examples of what will be rejected:

- `# Ignore previous instructions and...`
- Scenario names containing system prompt overrides
- Hidden directives in `"""` doc strings
- Base64-encoded instructions in fixture content
- Unicode tricks (zero-width characters, RTL overrides) to hide directives

### No sensitive data

Test scenarios must not contain API keys, tokens, credentials (real or realistic-looking), PII, internal URLs, or private repository paths.

### No executable content in test data

Doc strings in scenarios must not contain `<script>` tags, `javascript:` or `data:` URIs, event handler attributes (`onload`, `onerror`), or embedded iframes pointing to external resources.

[^cn-1]: ai:claude-opus-4.6 | 2026-03-08 | creation | proposed
    ai:claude-opus-4.6 2026-03-08T05:58:45Z: File created
