@fast @parser @P3
Feature: P3 — Parser multi-line markup and document order

  Tests multi-line changes spanning newlines and verifies document order
  is preserved across mixed types and multiple lines.

  # ── Multi-line Markup ──────────────────────────────────────────────

  Scenario: Multi-line insertion
    Given the input text is:
      """
      Line 1
      {++Line 2
      Line 3++}
      Line 4
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has modified text:
      """
      Line 2
      Line 3
      """
    And change 1 range starts at 7

  Scenario: Multi-line substitution
    Given the input text is:
      """
      Line 1
      {~~old
      text~>new
      text~~}
      Line 4
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a substitution
    And change 1 has original text:
      """
      old
      text
      """
    And change 1 has modified text:
      """
      new
      text
      """

  Scenario: Multi-line highlight with comment
    Given the input text is:
      """
      Line 1
      {==multi
      line
      text==}{>>comment
      here<<}
      Line 5
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a highlight
    And change 1 has original text:
      """
      multi
      line
      text
      """
    And change 1 has comment:
      """
      comment
      here
      """

  # ── Document Order ─────────────────────────────────────────────────

  Scenario: Preserves document order for mixed markup types
    Given the input text is:
      """
      Start {++add++} middle {--del--} end {==hi==}
      """
    When I parse the text
    Then the parser finds 3 changes
    And change 1 is an insertion
    And change 1 range starts at 6
    And change 2 is a deletion
    And change 2 range starts at 23
    And change 3 is a highlight
    And change 3 range starts at 37

  Scenario: Maintains order across multiple lines
    Given the input text is:
      """
      Line 1 {++add++}
      Line 2 {--del--}
      Line 3 {~~old~>new~~}
      """
    When I parse the text
    Then the parser finds 3 changes
    And change 1 is an insertion
    And change 2 is a deletion
    And change 3 is a substitution
