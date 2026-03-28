@core @file-operations
Feature: File operations
  Core file operations (applyProposeChange, appendFootnote, extractLineRange,
  replaceUnique, applySingleOperation, stripRefsFromContent) transform document
  text by wrapping changes in CriticMarkup syntax and managing footnotes.

  These operations build on the text-matching layer tested in C15-text-matching
  and produce the CriticMarkup-annotated documents that the parser (C1-C7) reads.

  # ── applyProposeChange ─────────────────────────────────────────────

  Scenario: Substitution wraps old text in CriticMarkup substitution markup
    Given a file-ops document "The quick brown fox jumps over the lazy dog."
    When I apply propose-change substituting "quick brown" with "slow red" as "cn-1" by "ai:claude-opus-4.6"
    Then the file-ops change type is "sub"
    And the file-ops output contains "{~~quick brown~>slow red~~}[^cn-1]"
    And the file-ops output contains "cn-1]: @ai:claude-opus-4.6"
    And the file-ops output contains "| sub | proposed"

  Scenario: Deletion wraps old text in CriticMarkup deletion markup
    Given a file-ops document "The quick brown fox jumps over the lazy dog."
    When I apply propose-change deleting " brown" as "cn-2" by "ai:claude-opus-4.6"
    Then the file-ops change type is "del"
    And the file-ops output contains "{-- brown--}[^cn-2]"
    And the file-ops output contains "| del | proposed"

  Scenario: Insertion adds new text after anchor with insertion markup
    Given a file-ops document "The quick fox jumps."
    When I apply propose-change inserting " brown" after "quick" as "cn-3" by "ai:claude-opus-4.6"
    Then the file-ops change type is "ins"
    And the file-ops output contains "quick{++ brown++}[^cn-3]"
    And the file-ops output contains "| ins | proposed"

  Scenario: Reasoning is included in the footnote
    Given a file-ops document "Hello world."
    When I apply propose-change substituting "world" with "earth" as "cn-1" by "ai:claude-opus-4.6" with reasoning "More specific term"
    Then the file-ops output contains "More specific term"
    And the file-ops output contains "cn-1]: @ai:claude-opus-4.6"

  Scenario: Not-found error when old text is absent
    Given a file-ops document "Hello world."
    When I apply propose-change substituting "xyz not here" with "replacement" as "cn-1" by "ai:claude-opus-4.6" expecting an error
    Then the file-ops error message matches "xyz not here"

  Scenario: Ambiguous error when old text appears multiple times
    Given a file-ops document "the cat and the dog"
    When I apply propose-change substituting "the" with "a" as "cn-1" by "ai:claude-opus-4.6" expecting an error
    Then the file-ops error message matches "ambiguous|multiple|context"

  Scenario: Both-empty error when old and new text are both empty
    Given a file-ops document "Hello world."
    When I apply propose-change with empty old and new text as "cn-1" by "ai:claude-opus-4.6" expecting an error
    Then the file-ops error message matches "empty"

  Scenario: No-insertAfter error for insertion without anchor
    Given a file-ops document "Hello world."
    When I apply propose-change inserting "text" without anchor as "cn-1" by "ai:claude-opus-4.6" expecting an error
    Then the file-ops error message matches "insertAfter"

  # ── appendFootnote ─────────────────────────────────────────────────

  Scenario: Appends footnote when no existing footnotes
    Given a file-ops document "Some text."
    When I append footnote "\n\n[^cn-1]: @alice | 2026-02-10 | sub | proposed"
    Then the file-ops footnote result is "Some text.\n\n[^cn-1]: @alice | 2026-02-10 | sub | proposed"

  Scenario: Appends footnote after existing footnotes
    Given a file-ops document with existing footnotes:
      """
      Some text.

      [^cn-1]: @alice | 2026-02-10 | sub | proposed
          @alice 2026-02-10: reason
      """
    When I append footnote "\n\n[^cn-2]: @bob | 2026-02-10 | ins | proposed"
    Then the file-ops footnote result contains "[^cn-1]:"
    And the file-ops footnote result contains "[^cn-2]:"
    And the file-ops footnote result contains "reason"

  Scenario: Ignores footnote definitions inside fenced code blocks
    Given a file-ops document with existing footnotes:
      """
      ## Example

      ```markdown
      [^cn-42]: @alice | 2026-02-10 | sub | proposed
      ```

      ## More content
      """
    When I append footnote "\n\n[^cn-1]: @bob | 2026-02-10 | ins | proposed"
    Then the file-ops footnote result ends with "[^cn-1]: @bob | 2026-02-10 | ins | proposed"

  # ── extractLineRange ───────────────────────────────────────────────

  Scenario: Extracts a single line with correct offsets
    Given file-ops lines "line one", "line two", "line three"
    When I extract line range 1 to 1
    Then the extracted content is "line one"
    And the extracted start offset is 0
    And the extracted end offset is 8

  Scenario: Extracts a multi-line range
    Given file-ops lines "line one", "line two", "line three"
    When I extract line range 1 to 2
    Then the extracted content is "line one\nline two"

  Scenario: Throws for out-of-range start line
    Given file-ops lines "line one", "line two", "line three"
    When I extract line range 0 to 1 expecting an error
    Then the file-ops error message matches "out of range"

  Scenario: Throws for out-of-range end line
    Given file-ops lines "line one", "line two", "line three"
    When I extract line range 1 to 4 expecting an error
    Then the file-ops error message matches "out of range"

  # ── replaceUnique ──────────────────────────────────────────────────

  Scenario: Replaces exact unique match in text
    Given a file-ops document "Hello world."
    When I replace-unique "world" with "earth"
    Then the file-ops replace result is "Hello earth."

  # ── applySingleOperation ───────────────────────────────────────────

  Scenario: Delegates to applyProposeChange for string-match substitution
    Given a file-ops document "Hello world."
    When I apply single-operation substituting "world" with "earth" as "cn-1" by "ai:test"
    Then the file-ops change type is "sub"
    And the file-ops output contains "{~~world~>earth~~}[^cn-1]"

  # ── stripRefsFromContent ───────────────────────────────────────────

  Scenario: Strips single footnote ref and returns it
    Given a file-ops content "| **RUNNING** | check |[^cn-2.1]"
    When I strip refs from the content
    Then the stripped content is "| **RUNNING** | check |"
    And the stripped refs are "[^cn-2.1]"

  Scenario: Strips multiple footnote refs
    Given a file-ops content "text[^cn-1][^cn-2] more"
    When I strip refs from the content
    Then the stripped content is "text more"
    And the stripped refs are "[^cn-1]" and "[^cn-2]"

  Scenario: Returns text unchanged when no refs present
    Given a file-ops content "just plain text"
    When I strip refs from the content
    Then the stripped content is "just plain text"
    And the stripped refs list is empty

  # ── ref preservation ───────────────────────────────────────────────

  Scenario: Preserves settled ref during substitution via view-aware match
    Given a file-ops document with refs:
      """
      | **RUNNING** | check |[^cn-1] end.

      [^cn-1]: @ai:test | 2026-02-20 | sub | accepted
      """
    When I apply propose-change substituting "| **RUNNING** | check |" with "| **DONE** 95% | check passed |" as "cn-2" by "ai:test"
    Then the file-ops output contains "[^cn-1]"
    And the file-ops output contains "{~~"
