@docx
Feature: DOCX Import and Export
  As a user working with Word documents and CriticMarkup markdown,
  I need to import DOCX tracked changes to CriticMarkup format
  and export CriticMarkup markdown back to DOCX with native tracked changes.

  Background:
    Given pandoc is available on PATH

  # --- Import scenarios ---

  @import @fast
  Scenario: Import a minimal DOCX with tracked changes
    Given a DOCX fixture "word-online-minimal-test.docx"
    When I import the DOCX file
    Then the import succeeds
    And the markdown contains CriticMarkup insertions
    And the import stats show at least 1 tracked change

  @import @fast
  Scenario: Import a DOCX with comments
    Given a DOCX fixture "word-online-comments-fixed-test.docx"
    When I import the DOCX file with comments enabled
    Then the import succeeds
    And the import stats show at least 1 comment

  @import @fast
  Scenario: Import with comments disabled
    Given a DOCX fixture "word-online-comments-fixed-test.docx"
    When I import the DOCX file with comments disabled
    Then the import succeeds
    And the import stats show 0 comments

  @import @fast
  Scenario: Import detects substitutions from adjacent del+ins
    Given a DOCX fixture "word-online-stress-test.docx"
    When I import the DOCX file with substitution merging enabled
    Then the import succeeds
    And the import stats show at least 1 substitution

  @import @fast
  Scenario: Import produces footnote annotations
    Given a DOCX fixture "word-online-minimal-test.docx"
    When I import the DOCX file
    Then the markdown contains footnote definitions matching "[^cn-"
    And each tracked change has a corresponding footnote

  # --- Export scenarios ---

  @export @fast
  Scenario: Export CriticMarkup to valid DOCX
    Given CriticMarkup markdown:
      """
      # Test Document

      This has {++an insertion++}[^cn-1] and {--a deletion--}[^cn-2].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-16 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX is a valid ZIP file
    And the DOCX document.xml contains "w:ins"
    And the DOCX document.xml contains "w:del"
    And the export stats show 1 insertion and 1 deletion

  @export @fast
  Scenario: Export in clean mode produces no tracked changes
    Given CriticMarkup markdown:
      """
      Text with {++added++}[^cn-1] words.

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "clean"
    Then the export succeeds
    And the DOCX document.xml does not contain "w:ins"
    And the DOCX document.xml does not contain "w:del"

  @export @fast
  Scenario: Export in settled mode applies accepted changes
    Given CriticMarkup markdown:
      """
      Before {++accepted text++}[^cn-1] middle {++proposed text++}[^cn-2] after.

      [^cn-1]: @alice | 2026-01-15 | ins | accepted
      [^cn-2]: @bob | 2026-01-16 | ins | proposed
      """
    When I export to DOCX with mode "settled"
    Then the export succeeds
    And the export stats show 1 insertion
    And the export stats show 0 deletions

  @export @fast
  Scenario: Export includes Word Online compatibility patches
    Given CriticMarkup markdown:
      """
      {++hello++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility
    Then the DOCX document.xml contains "w14:paraId"

  # --- Round-trip scenarios ---

  @roundtrip @slow
  Scenario: Round-trip DOCX -> markdown -> DOCX preserves change counts
    Given a DOCX fixture "word-online-minimal-test.docx"
    When I import the DOCX file
    And I export the imported markdown to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the original and re-imported change counts match

  @roundtrip @fast
  Scenario: Round-trip markdown -> DOCX -> markdown preserves content
    Given CriticMarkup markdown:
      """
      # Round Trip

      This has {++an insertion++}[^cn-1] and {--a deletion--}[^cn-2].

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      [^cn-2]: @bob | 2026-01-16 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    And I import the exported DOCX file
    Then the re-imported markdown contains "{++"
    And the re-imported markdown contains "{--"
    And the re-imported stats show at least 1 insertion
    And the re-imported stats show at least 1 deletion

  # --- Edge cases ---

  @edge @fast
  Scenario: Export handles document with no tracked changes
    Given CriticMarkup markdown:
      """
      # Clean Document

      No changes here.
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 0 insertions

  @edge @fast
  Scenario: Export handles empty document
    Given CriticMarkup markdown:
      """
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds

  @edge @fast
  Scenario: Export handles unicode content
    Given CriticMarkup markdown:
      """
      {++Zürich Straße++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion

  @edge @fast
  Scenario: Author names round-trip correctly
    Given CriticMarkup markdown:
      """
      {++text++}[^cn-1]

      [^cn-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export stats list author "Alice Chen"
