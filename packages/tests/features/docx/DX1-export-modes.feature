@docx
Feature: DX1 - Export Mode Matrix
  As a user exporting CriticMarkup to DOCX,
  I need tracked, settled, and clean modes to produce the correct Word XML output
  depending on how I want changes represented.

  # --- Tracked mode ---

  @export @fast
  Scenario: Tracked mode - insertion becomes w:ins
    Given CriticMarkup markdown:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the export stats show 1 insertion

  @export @fast
  Scenario: Tracked mode - deletion becomes w:del
    Given CriticMarkup markdown:
      """
      Hello {--world--}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:del"
    And the export stats show 1 deletion

  @export @fast
  Scenario: Tracked mode - substitution becomes w:del plus w:ins
    Given CriticMarkup markdown:
      """
      Hello {~~world~>earth~~}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:del"
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Tracked mode - multiple changes on one line
    Given CriticMarkup markdown:
      """
      The {++quick++}[^cn-1] brown {--slow--}[^cn-2] fox.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion and 1 deletion

  @export @fast
  Scenario: Tracked mode - changes spanning paragraph boundaries
    Given CriticMarkup markdown:
      """
      First paragraph {++with insertion

      spanning two paragraphs++}[^cn-1] end.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  @export @fast
  Scenario: Tracked mode - export stats accuracy
    Given CriticMarkup markdown:
      """
      {++ins1++}[^cn-1] {++ins2++}[^cn-2] {--del1--}[^cn-3] {~~old~>new~~}[^cn-4]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @alice | 2026-01-15 | ins | proposed
      [^cn-3]: @bob | 2026-01-15 | del | proposed
      [^cn-4]: @carol | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 2 insertions
    And the export stats show 1 deletion

  @export @fast
  Scenario: Tracked mode - custom title in export
    Given CriticMarkup markdown:
      """
      {++hello++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and title "My Custom Title"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"

  # --- Settled mode ---

  @export @fast
  Scenario: Settled mode - accepted insertion settles to plain text
    Given CriticMarkup markdown:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | ins | accepted
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:ins"
    And the export stats show 0 insertions

  @export @fast
  Scenario: Settled mode - rejected insertion is removed entirely
    Given CriticMarkup markdown:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | ins | rejected
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:ins"
    And the DOCX document.xml does not contain "world"
    And the export stats show 0 insertions

  @export @fast
  Scenario: Settled mode - proposed insertion stays as tracked change
    Given CriticMarkup markdown:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the export stats show 1 insertion

  @export @fast
  Scenario: Settled mode - accepted deletion settles (text removed)
    Given CriticMarkup markdown:
      """
      Hello {--world--}[^cn-1] end.

      [^cn-1]: @alice | 2026-01-15 | del | accepted
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:del"
    And the export stats show 0 deletions

  @export @fast
  Scenario: Settled mode - rejected deletion is restored
    Given CriticMarkup markdown:
      """
      Hello {--world--}[^cn-1] end.

      [^cn-1]: @alice | 2026-01-15 | del | rejected
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:del"
    And the export stats show 0 deletions

  @export @fast
  Scenario: Settled mode - substitution with accepted status
    Given CriticMarkup markdown:
      """
      Hello {~~world~>earth~~}[^cn-1].

      [^cn-1]: @alice | 2026-01-15 | sub | accepted
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:del"
    And the DOCX document.xml does not contain "w:ins"

  # --- Clean mode ---

  @export @fast
  Scenario: Clean mode - strips all markup entirely
    Given CriticMarkup markdown:
      """
      Hello {++world++}[^cn-1] and {--removed--}[^cn-2].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "clean"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:ins"
    And the DOCX document.xml does not contain "w:del"

  @export @fast
  Scenario: Clean mode - preserves headings and paragraphs
    Given CriticMarkup markdown:
      """
      # Main Title

      First paragraph with {++added++}[^cn-1] text.

      ## Subtitle

      Second paragraph.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "clean"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:ins"
