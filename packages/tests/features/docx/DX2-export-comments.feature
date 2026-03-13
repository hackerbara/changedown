@docx
Feature: DX2 - Export Comment Handling
  As a user exporting CriticMarkup with comments,
  I need comments to map correctly to Word comment elements
  with proper threading, initials, and filtering.

  @export @fast
  Scenario: Highlight with attached comment exports as Word comment
    Given CriticMarkup markdown:
      """
      This is {==highlighted text==}{>>A review comment<<}[^ct-1].

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the DOCX contains file "word/comments.xml"

  @export @fast
  Scenario: Standalone comment exports
    Given CriticMarkup markdown:
      """
      This has a {>>standalone note<<}[^ct-1] in it.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the DOCX contains file "word/comments.xml"

  @export @fast
  Scenario: Comment mode all includes all comments
    Given CriticMarkup markdown:
      """
      {>>first comment<<}[^ct-1] and {>>second comment<<}[^ct-2].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-16 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the export stats show at least 2 comments

  @export @fast
  Scenario: Comment mode none strips all comments
    Given CriticMarkup markdown:
      """
      {>>a comment<<}[^ct-1] text.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "none"
    Then the export succeeds
    And the export stats show 0 comments

  @export @fast
  Scenario: DOCX contains word/comments.xml when comments are present
    Given CriticMarkup markdown:
      """
      Text {>>note here<<}[^ct-1].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the DOCX contains file "word/comments.xml"

  @export @fast
  Scenario: Comment initials - regular author gets initials
    Given CriticMarkup markdown:
      """
      {++inserted++}[^ct-1]

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the export stats list author "Alice Chen"

  @export @fast
  Scenario: Comment initials - AI author gets AI initials
    Given CriticMarkup markdown:
      """
      {>>ai suggestion<<}[^ct-1]

      [^ct-1]: @ai:claude-opus-4.6 | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds

  @export @fast
  Scenario: Multiple tracked changes from different authors
    Given CriticMarkup markdown:
      """
      {++alice added++}[^ct-1] and {--bob removed--}[^ct-2].

      [^ct-1]: @alice-chen | 2026-01-15 | ins | proposed
      [^ct-2]: @bob-smith | 2026-01-16 | del | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the export stats list author "Alice Chen"
    And the export stats list author "Bob Smith"

  @export @fast
  Scenario: Comment on accepted change in settled mode
    Given CriticMarkup markdown:
      """
      {==highlighted==}{>>settled comment<<}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | accepted
      """
    When I export to DOCX with mode "settled" and comments "all"
    Then the export succeeds

  @export @fast
  Scenario: Highlight without comment (just yellow highlighting)
    Given CriticMarkup markdown:
      """
      This is {==highlighted only==}[^ct-1] text.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds

  @export @fast
  Scenario: Empty comment text
    Given CriticMarkup markdown:
      """
      {>><<}[^ct-1] text after.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds

  @export @fast
  Scenario: No comments produces no comments.xml
    Given CriticMarkup markdown:
      """
      Just {++an insertion++}[^ct-1].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "none"
    Then the export succeeds
    And the export stats show 0 comments
