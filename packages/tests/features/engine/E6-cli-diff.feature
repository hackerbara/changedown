@fast @E6
Feature: E6 - CLI Diff
  `sc diff` renders CriticMarkup files with ANSI colors, supporting view modes,
  markup display, thread expansion, and Unicode strikethrough control.

  Background:
    Given a temporary diff file "basic.md" with content:
      """
      Hello {++world++} there.
      """

  # ── View modes ──────────────────────────────────────────────────────────────

  Scenario: Default view mode is review
    When I run diff on "basic.md"
    Then the diff output contains "world"
    And the diff output contains ANSI escape codes

  Scenario: Review view shows insertions and deletions
    Given a temporary diff file "mixed.md" with content:
      """
      Hello {++inserted++} and {--deleted--} text.
      """
    When I run diff on "mixed.md" with view "review"
    Then the diff output contains "inserted"
    And the diff output contains ANSI red color code for deletions

  Scenario: Settled view strips resolved markup
    Given a temporary diff file "settled.md" with content:
      """
      Hello {++world++}[^cn-1] there.

      [^cn-1]: @alice | 2026-02-01 | ins | accepted
          reason: added greeting
      """
    When I run diff on "settled.md" with view "settled"
    Then the diff output contains "world"

  Scenario: Changes view marks lines with pending changes
    Given a temporary diff file "changes.md" with content:
      """
      Hello {++world++} there.
      """
    When I run diff on "changes.md" with view "changes"
    Then the diff output contains ANSI escape codes
    And the diff output contains "Hello"

  Scenario: Raw view shows original markup text
    Given a temporary diff file "raw.md" with content:
      """
      Hello {++world++} there.
      """
    When I run diff on "raw.md" with view "raw"
    Then the diff output contains "world"

  # ── --show-markup option ────────────────────────────────────────────────────

  Scenario: Show-markup includes CriticMarkup delimiters in output
    When I run diff on "basic.md" with showMarkup enabled
    Then the diff output contains "{++"
    And the diff output contains "++}"

  # ── --no-unicode-strike option ──────────────────────────────────────────────

  Scenario: Unicode strikethrough is enabled by default
    Given a temporary diff file "del.md" with content:
      """
      Hello {--removed--} text.
      """
    When I run diff on "del.md"
    Then the diff output is produced without error

  Scenario: Disabling Unicode strikethrough still produces output
    Given a temporary diff file "del2.md" with content:
      """
      Hello {--removed--} text.
      """
    When I run diff on "del2.md" with unicodeStrike disabled
    Then the diff output is produced without error

  # ── --threads option ────────────────────────────────────────────────────────

  Scenario: Threads disabled by default — no thread expansion
    Given a temporary diff file "threaded.md" with content:
      """
      Some {++added text++}[^cn-1] here.

      [^cn-1]: @alice | 2026-02-27 | ins | proposed
          reason: adding context
          @bob 2026-02-27: Looks good to me
      """
    When I run diff on "threaded.md"
    Then the diff output does not contain "Looks good to me"

  Scenario: Threads enabled expands discussion replies inline
    Given a temporary diff file "threaded2.md" with content:
      """
      Some {++added text++}[^cn-1] here.

      [^cn-1]: @alice | 2026-02-27 | ins | proposed
          reason: adding context
          @bob 2026-02-27: Looks good to me
      """
    When I run diff on "threaded2.md" with threads enabled
    Then the diff output contains "Looks good to me"
    And the diff output contains "@bob"

  Scenario: Thread replies from multiple changes appear in document order
    Given a temporary diff file "multi-thread.md" with content:
      """
      First {++change one++}[^cn-1] here.
      Second {--change two--}[^cn-2] here.

      [^cn-1]: @alice | 2026-02-27 | ins | proposed
          reason: first
          @bob 2026-02-27: Reply to first
      [^cn-2]: @alice | 2026-02-27 | del | proposed
          reason: second
          @carol 2026-02-27: Reply to second
      """
    When I run diff on "multi-thread.md" with threads enabled
    Then the diff output contains "Reply to first"
    And the diff output contains "Reply to second"
    And "Reply to first" appears before "Reply to second" in the diff output

  Scenario: No thread replies produces same output as threads disabled
    Given a temporary diff file "no-replies.md" with content:
      """
      Some {++added text++}[^cn-1] here.

      [^cn-1]: @alice | 2026-02-27 | ins | proposed
          reason: no replies
      """
    When I run diff on "no-replies.md" with threads enabled
    And I capture diff output as "with-threads"
    And I run diff on "no-replies.md"
    And I capture diff output as "without-threads"
    Then the captured outputs "with-threads" and "without-threads" are equal

  # ── Git diff driver detection ───────────────────────────────────────────────

  Scenario: Detects valid git diff driver invocation
    Given git diff driver argv with 7 args and valid SHA "abc123def456789012345678901234567890abcd"
    Then it is recognized as a git diff driver invocation

  Scenario: Rejects non-7-arg invocations
    Given git diff driver argv with 3 args
    Then it is not recognized as a git diff driver invocation

  Scenario: Rejects invalid SHA at position 2
    Given git diff driver argv with 7 args and invalid SHA "not-a-sha-at-all-needs-forty-hex-chars!"
    Then it is not recognized as a git diff driver invocation
