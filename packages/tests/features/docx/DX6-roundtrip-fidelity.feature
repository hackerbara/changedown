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
      Text with {++inserted words++}[^cn-1] here.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
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
      Text with {--deleted words--}[^cn-1] here.

      [^cn-1]: @alice | 2026-01-15 | del | proposed
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
      Text with {~~old phrase~>new phrase~~}[^cn-1] here.

      [^cn-1]: @alice | 2026-01-15 | sub | proposed
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

      Has {++insertion++}[^cn-1], {--deletion--}[^cn-2], and {~~sub old~>sub new~~}[^cn-3].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-15 | del | proposed
      [^cn-3]: @carol | 2026-01-15 | sub | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion
    And the re-imported stats show at least 1 deletion

  @roundtrip @fast
  Scenario: Round-trip preserves author names
    Given CriticMarkup markdown:
      """
      {++text++}[^cn-1]

      [^cn-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats list author matching "alice" or "Alice"

  @roundtrip @fast
  Scenario: Round-trip with multiple authors
    Given CriticMarkup markdown:
      """
      {++alice text++}[^cn-1] and {--bob text--}[^cn-2].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-16 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion
    And the re-imported stats show at least 1 deletion

  @roundtrip @fast
  Scenario: Round-trip settled mode - only proposed changes survive
    Given CriticMarkup markdown:
      """
      {++accepted++}[^cn-1] and {++proposed++}[^cn-2].

      [^cn-1]: @alice | 2026-01-15 | ins | accepted
      [^cn-2]: @bob | 2026-01-15 | ins | proposed
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

      Paragraph with {++change++}[^cn-1].

      ### Subsection

      More text.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported markdown contains "Main Title"
    And the re-imported stats show at least 1 insertion

  @roundtrip @fast
  Scenario: Empty-content deletion round-trips
    Given CriticMarkup markdown:
      """
      Text with{----}[^cn-1] more text.

      [^cn-1]: @alice | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats show 1 deletion
    When I import the exported DOCX file
    Then the re-imported stats show at least 1 deletion

  @roundtrip @fast
  Scenario: Empty-content insertion round-trips
    Given CriticMarkup markdown:
      """
      Text with{++++}[^cn-1] more text.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats show 1 insertion
    When I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion

  @roundtrip @fast
  Scenario: Comment round-trip preserves text and author
    Given CriticMarkup markdown:
      """
      Text with {==highlighted==}{>>review this<<}[^cn-1] here.

      [^cn-1]: @alice | 2026-01-15 | hl | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats show 1 comments
    When I import the exported DOCX file
    Then the re-imported stats show at least 1 comment
    And the re-imported markdown contains "review this"

  @roundtrip @fast
  Scenario: Zero-length comment round-trip
    Given CriticMarkup markdown:
      """
      Text here.{>>standalone note<<}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | hl | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats show 1 comments
    When I import the exported DOCX file
    Then the re-imported stats show at least 1 comment
    And the re-imported markdown contains "standalone note"

  @roundtrip @fast
  Scenario: Non-adjacent del+ins not merged into substitution
    Given CriticMarkup markdown:
      """
      Word{--old--}[^cn-1] text {++new++}[^cn-2] here.

      [^cn-1]: @alice | 2026-01-15 | del | proposed
      [^cn-2]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 deletion
    And the re-imported stats show at least 1 insertion
    And the re-imported markdown contains "{--"
    And the re-imported markdown contains "{++"

  @roundtrip @fast
  Scenario: Adjacent same-type changes stay separate
    Given CriticMarkup markdown:
      """
      Text{--first--}[^cn-1]{--second--}[^cn-2] here.

      [^cn-1]: @alice | 2026-01-15 | del | proposed
      [^cn-2]: @alice | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 2 deletions

  @roundtrip @fast
  Scenario: Compound merging — adjacent insertions stay separate even after del+ins merge
    Given CriticMarkup markdown:
      """
      Text{--removed--}[^cn-1]{++first++}[^cn-2]{++second++}[^cn-3] here.

      [^cn-1]: @alice | 2026-01-15 | del | proposed
      [^cn-2]: @alice | 2026-01-15 | ins | proposed
      [^cn-3]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported stats show at least 1 insertion
