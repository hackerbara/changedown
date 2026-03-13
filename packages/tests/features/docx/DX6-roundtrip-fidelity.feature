@docx
Feature: DX6 - Round-trip Fidelity
  As a user converting between DOCX and CriticMarkup,
  I need round-trip conversions to preserve content, authors,
  and change types with high fidelity.

  Background:
    Given pandoc is available on PATH

  @roundtrip @fast
  Scenario: Insertion round-trip preserves text
    Given CriticMarkup markdown:
      """
      Text with {++inserted words++}[^ct-1] here.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported markdown contains "{++"
    And the re-imported markdown contains "inserted words"
    And the re-imported stats show at least 1 insertion

  @roundtrip @fast
  Scenario: Deletion round-trip preserves text
    Given CriticMarkup markdown:
      """
      Text with {--deleted words--}[^ct-1] here.

      [^ct-1]: @alice | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported markdown contains "{--"
    And the re-imported markdown contains "deleted words"
    And the re-imported stats show at least 1 deletion

  @roundtrip @fast
  Scenario: Substitution round-trip preserves both old and new text
    Given CriticMarkup markdown:
      """
      Text with {~~old phrase~>new phrase~~}[^ct-1] here.

      [^ct-1]: @alice | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported markdown contains "old phrase"
    And the re-imported markdown contains "new phrase"

  @roundtrip @fast
  Scenario: Mixed changes round-trip
    Given CriticMarkup markdown:
      """
      # Document

      Has {++insertion++}[^ct-1], {--deletion--}[^ct-2], and {~~sub old~>sub new~~}[^ct-3].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-15 | del | proposed
      [^ct-3]: @carol | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion
    And the re-imported stats show at least 1 deletion

  @roundtrip @fast
  Scenario: Round-trip preserves author names
    Given CriticMarkup markdown:
      """
      {++text++}[^ct-1]

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats list author matching "alice" or "Alice"

  @roundtrip @fast
  Scenario: Round-trip with multiple authors
    Given CriticMarkup markdown:
      """
      {++alice text++}[^ct-1] and {--bob text--}[^ct-2].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-16 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion
    And the re-imported stats show at least 1 deletion

  @roundtrip @fast
  Scenario: Round-trip settled mode - only proposed changes survive
    Given CriticMarkup markdown:
      """
      {++accepted++}[^ct-1] and {++proposed++}[^ct-2].

      [^ct-1]: @alice | 2026-01-15 | ins | accepted
      [^ct-2]: @bob | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "settled"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion
    And the re-imported markdown contains "accepted"
    And the re-imported markdown contains "proposed"

  @roundtrip @slow
  Scenario: Round-trip through stress-test fixture
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file
    And I export the imported markdown to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the original and re-imported change counts match

  @roundtrip @slow
  Scenario: Round-trip through mid-test fixture
    Given a DOCX fixture "word-online-mid-test.docx"
    When I import the DOCX file
    And I export the imported markdown to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the original and re-imported change counts match

  @roundtrip @fast
  Scenario: Round-trip preserves heading structure
    Given CriticMarkup markdown:
      """
      # Main Title

      ## Section One

      Paragraph with {++change++}[^ct-1].

      ### Subsection

      More text.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported markdown contains "Main Title"
    And the re-imported stats show at least 1 insertion
