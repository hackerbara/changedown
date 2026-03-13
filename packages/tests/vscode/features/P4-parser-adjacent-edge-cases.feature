@fast @parser @P4
Feature: P4 — Parser adjacent markup, edge cases, and nested content

  Tests adjacent markup node separation, edge case handling (empty, whitespace,
  unclosed, malformed), and content containing markup-like characters.

  # ── Adjacent Markup ────────────────────────────────────────────────

  Scenario: Adjacent markup parsed as separate nodes with correct ranges
    Given the input text is:
      """
      {++add++}{--del--}{~~old~>new~~}
      """
    When I parse the text
    Then the parser finds 3 changes
    And change 1 is an insertion
    And change 1 range starts at 0
    And change 1 range ends at 9
    And change 2 is a deletion
    And change 2 range starts at 9
    And change 2 range ends at 18
    And change 3 is a substitution
    And change 3 range starts at 18

  Scenario: Whitespace between adjacent markup
    Given the input text is:
      """
      {++add++} {--del--}
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 range ends at 9
    And change 2 range starts at 10

  # ── Edge Cases ─────────────────────────────────────────────────────

  Scenario: Empty insertion and deletion markup
    Given the input text is:
      """
      Text {++++} more {----} end
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 has modified text ""
    And change 2 has original text ""

  Scenario: Markup with only whitespace content
    Given the input text is:
      """
      Text {++   ++} more
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has modified text "   "

  Scenario: Malformed substitution without separator is ignored
    Given the input text is:
      """
      Text {~~no separator~~} more
      """
    When I parse the text
    Then no changes are found

  Scenario: Highlight followed by non-comment markup
    Given the input text is:
      """
      {==text==}{++not a comment++}
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 is a highlight
    And change 1 has no comment
    And change 2 is an insertion

  Scenario: Highlight with whitespace before comment (not attached)
    Given the input text is:
      """
      {==text==} {>>comment<<}
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 is a highlight
    And change 1 has no comment
    And change 2 is a comment

  # ── Nested Content ─────────────────────────────────────────────────

  Scenario: Markup characters within content are preserved
    Given the input text is:
      """
      {++text with { and } chars++}
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has modified text "text with { and } chars"

  Scenario: Partial delimiters in content are preserved
    Given the input text is:
      """
      {++text with ++ and -- inside++}
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has modified text "text with ++ and -- inside"

  Scenario: Multiple ~> separators — first splits, rest are content
    Given the input text is:
      """
      {~~old text~>new~>text~~}
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has original text "old text"
    And change 1 has modified text "new~>text"
