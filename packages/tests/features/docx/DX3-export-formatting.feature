@docx
Feature: DX3 - Export Formatting and Structure
  As a user exporting CriticMarkup containing inline formatting,
  I need the exported DOCX to preserve formatting within tracked changes
  and strip ChangeDown metadata from the output.

  @export @fast
  Scenario: Bold text inside tracked change
    Given CriticMarkup markdown:
      """
      {++**bold inserted text**++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Italic text inside tracked change
    Given CriticMarkup markdown:
      """
      {++*italic inserted text*++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Code span inside tracked change
    Given CriticMarkup markdown:
      """
      {++`code span`++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Headings with tracked changes
    Given CriticMarkup markdown:
      """
      # Title {++Added to Title++}[^cn-1]

      ## Subtitle {--Removed from Subtitle--}[^cn-2]

      ### Level 3 {~~old heading~>new heading~~}[^cn-3]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @alice | 2026-01-15 | del | proposed
      [^cn-3]: @alice | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the DOCX document.xml contains "w:del"

  @export @fast
  Scenario: Bullet list with tracked changes
    Given CriticMarkup markdown:
      """
      - Item one {++added++}[^cn-1]
      - {--Removed item--}[^cn-2]
      - Item three

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion and 1 deletion

  @export @fast
  Scenario: Ordered list with tracked changes
    Given CriticMarkup markdown:
      """
      1. First {++new++}[^cn-1] item
      2. Second item
      3. {--Third item--}[^cn-2]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion and 1 deletion

  @export @fast
  Scenario: Multiple paragraphs with mixed change types
    Given CriticMarkup markdown:
      """
      First paragraph has {++an insertion++}[^cn-1].

      Second paragraph has {--a deletion--}[^cn-2].

      Third paragraph has {~~old text~>new text~~}[^cn-3].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-15 | del | proposed
      [^cn-3]: @carol | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the DOCX document.xml contains "w:del"

  @export @fast
  Scenario: Tracking header is stripped from exported DOCX
    Given CriticMarkup markdown:
      """
      <!-- changedown.com/v1: tracked -->

      # Document

      {++inserted++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml does not contain "changedown.com"

  @export @fast
  Scenario: Footnote block is stripped from exported DOCX
    Given CriticMarkup markdown:
      """
      Text {++added++}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml does not contain "[^cn-1]"

  @export @fast
  Scenario: Bare insertion without footnote metadata
    Given CriticMarkup markdown:
      """
      This has {++bare insertion++} with no footnote.
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
