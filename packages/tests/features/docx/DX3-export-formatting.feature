@docx
Feature: DX3 - Export Formatting and Structure
  As a user exporting CriticMarkup containing inline formatting,
  I need the exported DOCX to preserve formatting within tracked changes
  and strip ChangeTracks metadata from the output.

  @export @fast
  Scenario: Bold text inside tracked change
    Given CriticMarkup markdown:
      """
      {++**bold inserted text**++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Italic text inside tracked change
    Given CriticMarkup markdown:
      """
      {++*italic inserted text*++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Code span inside tracked change
    Given CriticMarkup markdown:
      """
      {++`code span`++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Headings with tracked changes
    Given CriticMarkup markdown:
      """
      # Title {++Added to Title++}[^ct-1]

      ## Subtitle {--Removed from Subtitle--}[^ct-2]

      ### Level 3 {~~old heading~>new heading~~}[^ct-3]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @alice | 2026-01-15 | del | proposed
      [^ct-3]: @alice | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the DOCX document.xml contains "w:del"

  @export @fast
  Scenario: Bullet list with tracked changes
    Given CriticMarkup markdown:
      """
      - Item one {++added++}[^ct-1]
      - {--Removed item--}[^ct-2]
      - Item three

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion and 1 deletion

  @export @fast
  Scenario: Ordered list with tracked changes
    Given CriticMarkup markdown:
      """
      1. First {++new++}[^ct-1] item
      2. Second item
      3. {--Third item--}[^ct-2]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion and 1 deletion

  @export @fast
  Scenario: Multiple paragraphs with mixed change types
    Given CriticMarkup markdown:
      """
      First paragraph has {++an insertion++}[^ct-1].

      Second paragraph has {--a deletion--}[^ct-2].

      Third paragraph has {~~old text~>new text~~}[^ct-3].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-15 | del | proposed
      [^ct-3]: @carol | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the DOCX document.xml contains "w:del"

  @export @fast
  Scenario: Tracking header is stripped from exported DOCX
    Given CriticMarkup markdown:
      """
      <!-- ctrcks.com/v1: tracked -->

      # Document

      {++inserted++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml does not contain "ctrcks.com"

  @export @fast
  Scenario: Footnote block is stripped from exported DOCX
    Given CriticMarkup markdown:
      """
      Text {++added++}[^ct-1].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml does not contain "[^ct-1]"

  @export @fast
  Scenario: Bare insertion without footnote metadata
    Given CriticMarkup markdown:
      """
      This has {++bare insertion++} with no footnote.
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
