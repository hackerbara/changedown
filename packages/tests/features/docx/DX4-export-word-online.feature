@docx
Feature: DX4 - Word Online Compatibility Patches
  As a user who opens exported DOCX files in Word Online,
  I need compatibility patches applied so that tracked changes
  and comments render correctly in the browser-based editor.

  @export @fast
  Scenario: paraId attributes added to paragraphs
    Given CriticMarkup markdown:
      """
      {++hello++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility
    Then the export succeeds
    And the DOCX document.xml contains "w14:paraId"

  @export @fast
  Scenario: commentReference wrapped in run with style
    Given CriticMarkup markdown:
      """
      {==highlighted==}{>>a comment<<}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility and comments "all"
    Then the export succeeds
    And the DOCX document.xml contains "w:commentReference"

  @export @fast
  Scenario: commentsExtended.xml created for threaded comments
    Given CriticMarkup markdown:
      """
      {==text==}{>>a comment<<}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility and comments "all"
    Then the export succeeds
    And the DOCX contains file "word/commentsExtended.xml"

  @export @fast
  Scenario: Content_Types.xml updated with commentsExtended
    Given CriticMarkup markdown:
      """
      {==text==}{>>a comment<<}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility and comments "all"
    Then the export succeeds
    And the DOCX file "[Content_Types].xml" contains "commentsExtended"

  @export @fast
  Scenario: CommentReference style added to styles.xml
    Given CriticMarkup markdown:
      """
      {==text==}{>>a comment<<}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility and comments "all"
    Then the export succeeds
    And the DOCX contains file "word/styles.xml"

  @export @fast
  Scenario: document.xml.rels contains commentsExtended relationship
    Given CriticMarkup markdown:
      """
      {==text==}{>>a comment<<}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility and comments "all"
    Then the export succeeds
    And the DOCX file "word/_rels/document.xml.rels" contains "commentsExtended"

  @export @fast
  Scenario: Word Online compat disabled produces no paraIds
    Given CriticMarkup markdown:
      """
      {++hello++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX without Word Online compatibility
    Then the export succeeds
    And the DOCX document.xml does not contain "w14:paraId"

  @export @fast
  Scenario: rPrChange gets child rPr element with Word Online compat
    Given CriticMarkup markdown:
      """
      {++**bold tracked**++}[^cn-1]

      [^cn-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with Word Online compatibility
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
