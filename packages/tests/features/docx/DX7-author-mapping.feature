@docx
Feature: DX7 - Author Name Mapping
  As a user exporting CriticMarkup with various author formats,
  I need author handles to convert correctly to display names
  with proper capitalization and initials.

  @export @fast
  Scenario: Hyphenated handle converts to display name
    Given CriticMarkup markdown:
      """
      {++text++}[^ct-1]

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats list author "Alice Chen"

  @export @fast
  Scenario: AI author handle converts correctly
    Given CriticMarkup markdown:
      """
      {++ai text++}[^ct-1]

      [^ct-1]: @ai:claude-opus-4.6 | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds

  @export @fast
  Scenario: Unknown author handle included in author stats
    Given CriticMarkup markdown:
      """
      {++mystery text++}[^ct-1]

      [^ct-1]: @unknown | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion
    And the export stats list author "Unknown Author"

  @export @fast
  Scenario: Multiple hyphenated name parts
    Given CriticMarkup markdown:
      """
      {++text++}[^ct-1]

      [^ct-1]: @jean-paul-sartre | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats list author "Jean Paul Sartre"

  @export @fast
  Scenario: Single-name author
    Given CriticMarkup markdown:
      """
      {++text++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats list author "Alice"

  @export @roundtrip @fast
  Scenario: Author preserved through export and re-import
    Given CriticMarkup markdown:
      """
      {++hello++}[^ct-1]

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats list author matching "alice" or "Alice"

  @export @fast
  Scenario: Multiple distinct authors in one document
    Given CriticMarkup markdown:
      """
      {++alice text++}[^ct-1] {--bob text--}[^ct-2] {~~carol old~>carol new~~}[^ct-3]

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      [^ct-2]: @bob-smith | 2026-01-15 | del | proposed
      [^ct-3]: @carol-jones | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats list author "Alice Chen"
    And the export stats list author "Bob Smith"
    And the export stats list author "Carol Jones"

  @export @fast
  Scenario: AI author initials differ from human initials
    Given CriticMarkup markdown:
      """
      {++human text++}[^ct-1] {++ai text++}[^ct-2]

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      [^ct-2]: @ai:claude-opus-4.6 | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats list author "Alice Chen"
