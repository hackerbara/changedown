@core @markdown-annotator @C23
Feature: C23 — Markdown Annotator
  annotateMarkdown produces CriticMarkup from text diffs.

  It uses diffLines for line-level structure, then drills down with diffChars
  for character-level precision. Adjacent remove+add at character level produce
  substitution markup.

  # ── Identical / no-op ──────────────────────────────────────────────

  Scenario: Identical texts return unchanged
    Given the original markdown text:
      """
      Hello world
      """
    When the text is changed to:
      """
      Hello world
      """
    Then the annotated markdown output is:
      """
      Hello world
      """

  # ── Single-element changes ─────────────────────────────────────────

  Scenario: Single word insertion at end
    Given the original markdown text:
      """
      Hello
      """
    When the text is changed to:
      """
      Hello world
      """
    Then the annotated markdown output contains "{++ world++}"

  Scenario: Single word deletion at end
    Given the original markdown text:
      """
      Hello world
      """
    When the text is changed to:
      """
      Hello
      """
    Then the annotated markdown output contains "{-- world--}"

  Scenario: Word substitution via adjacent remove and add
    Given the original markdown text:
      """
      The cat sat
      """
    When the text is changed to:
      """
      The dog sat
      """
    Then the annotated markdown output contains "{~~cat~>dog~~}"

  # ── Multi-word changes ─────────────────────────────────────────────

  Scenario: Multi-word insertion
    Given the original markdown text:
      """
      Hello world
      """
    When the text is changed to:
      """
      Hello beautiful new world
      """
    Then the annotated markdown output contains "{++"
    And the annotated markdown output does not contain "{--"

  Scenario: Multi-word deletion
    Given the original markdown text:
      """
      Hello beautiful new world
      """
    When the text is changed to:
      """
      Hello world
      """
    Then the annotated markdown output contains "{--"
    And the annotated markdown output does not contain "{++"

  Scenario: Multi-word substitution
    Given the original markdown text:
      """
      The quick brown fox
      """
    When the text is changed to:
      """
      The slow red fox
      """
    Then the annotated markdown output contains "{~~"
    And the annotated markdown output contains "~>"
    And the annotated markdown output contains "~~}"

  # ── Full-line changes ──────────────────────────────────────────────

  Scenario: Full line insertion between existing lines
    Given the original markdown text:
      """
      Line 1
      Line 3
      """
    When the text is changed to:
      """
      Line 1
      Line 2
      Line 3
      """
    Then the annotated markdown output is:
      """
      Line 1
      {++Line 2
      ++}Line 3
      """

  Scenario: Full line deletion from middle
    Given the original markdown text:
      """
      Line 1
      Line 2
      Line 3
      """
    When the text is changed to:
      """
      Line 1
      Line 3
      """
    Then the annotated markdown output is:
      """
      Line 1
      {--Line 2
      --}Line 3
      """

  Scenario: Full line replacement uses character-level substitution
    Given the original markdown text:
      """
      Line 1
      Old line
      Line 3
      """
    When the text is changed to:
      """
      Line 1
      New line
      Line 3
      """
    Then the annotated markdown output contains "{~~Old~>New~~}"
    And the annotated markdown output contains "Line 1"
    And the annotated markdown output contains "Line 3"

  # ── Paragraph-level and multi-change ────────────────────────────────

  Scenario: Multiple changes in one paragraph
    Given the original markdown text:
      """
      The quick brown fox
      """
    When the text is changed to:
      """
      The slow brown dog
      """
    Then the annotated markdown output contains "{~~quick~>slow~~}"
    And the annotated markdown output contains "brown"

  Scenario: Changes across multiple paragraphs
    Given the original markdown text:
      """
      First paragraph.

      Second paragraph.
      """
    When the text is changed to:
      """
      First section.

      Second part.
      """
    Then the annotated markdown output contains "{~~paragraph~>section~~}"
    And the annotated markdown output contains "Second"

  # ── Adjacent same-type changes on one line ─────────────────────────

  Scenario: Adjacent insertions on same line
    Given the original markdown text:
      """
      A C
      """
    When the text is changed to:
      """
      A B C D
      """
    Then the annotated markdown output contains "{++B ++}"
    And the annotated markdown output contains "{++ D++}"

  Scenario: Adjacent deletions on same line
    Given the original markdown text:
      """
      A B C D
      """
    When the text is changed to:
      """
      A D
      """
    Then the annotated markdown output contains "{--B C --}"

  # ── Mixed change types ─────────────────────────────────────────────

  Scenario: Mixed insertions and deletions in one line
    Given the original markdown text:
      """
      The old text here
      """
    When the text is changed to:
      """
      A new text there
      """
    Then the annotated markdown output contains "{~~"
    And the annotated markdown output contains "text"

  # ── Empty text edge cases ──────────────────────────────────────────

  Scenario: Empty old text produces full insertion
    Given the original markdown text:
      """
      """
    When the text is changed to:
      """
      Hello world
      """
    Then the annotated markdown output is:
      """
      {++Hello world++}
      """

  Scenario: Empty new text produces full deletion
    Given the original markdown text:
      """
      Hello world
      """
    When the text is changed to:
      """
      """
    Then the annotated markdown output is:
      """
      {--Hello world--}
      """

  Scenario: Both texts empty returns empty string
    Given the original markdown text:
      """
      """
    When the text is changed to:
      """
      """
    Then the annotated markdown output is:
      """
      """

  # ── Whitespace and special characters ──────────────────────────────

  Scenario: Whitespace-only insertion
    Given the original markdown text:
      """
      Hello world
      """
    When the text is changed to:
      """
      Hello  world
      """
    Then the annotated markdown output contains "{++ ++}"

  Scenario: Special characters in changed text
    Given the original markdown text:
      """
      Price: $10 & tax
      """
    When the text is changed to:
      """
      Price: $20 & fee
      """
    Then the annotated markdown output contains "{~~1~>2~~}"
    And the annotated markdown output contains "{~~tax~>fee~~}"

  # ── Multi-line block changes ───────────────────────────────────────

  Scenario: Multi-line block insertion
    Given the original markdown text:
      """
      Start
      End
      """
    When the text is changed to:
      """
      Start
      Middle A
      Middle B
      End
      """
    Then the annotated markdown output contains "{++Middle A"
    And the annotated markdown output contains "Middle B"
    And the annotated markdown output contains "++}"

  Scenario: Multi-line block deletion
    Given the original markdown text:
      """
      Start
      Middle A
      Middle B
      End
      """
    When the text is changed to:
      """
      Start
      End
      """
    Then the annotated markdown output contains "{--Middle A"
    And the annotated markdown output contains "Middle B"
    And the annotated markdown output contains "--}"
