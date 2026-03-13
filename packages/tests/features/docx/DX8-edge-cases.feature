@docx
Feature: DX8 - Edge Cases and Error Handling
  As a user working with unusual or extreme CriticMarkup content,
  I need the DOCX exporter to handle edge cases gracefully
  without crashing or producing corrupt output.

  @edge @fast
  Scenario: Very long insertion (>1000 chars)
    Given CriticMarkup markdown:
      """
      {++Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX document.xml contains "w:ins"
    And the export stats show 1 insertion

  @edge @fast
  Scenario: Many tracked changes (>50)
    Given CriticMarkup markdown with 60 insertions
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 60 insertions

  @edge @fast
  Scenario: Nested markup - highlight containing comment
    Given CriticMarkup markdown:
      """
      This is {==highlighted text==}{>>with a comment<<}[^ct-1].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds

  @edge @fast
  Scenario: Adjacent changes with no space between
    Given CriticMarkup markdown:
      """
      {++first++}[^ct-1]{++second++}[^ct-2]{--third--}[^ct-3]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @alice | 2026-01-15 | ins | proposed
      [^ct-3]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 2 insertions
    And the export stats show 1 deletion

  @edge @fast
  Scenario: Change at start of document
    Given CriticMarkup markdown:
      """
      {++Start of document++}[^ct-1] rest of text.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion

  @edge @fast
  Scenario: Change at end of document
    Given CriticMarkup markdown:
      """
      Text at the start {++end of document++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 1 insertion

  @edge @fast
  Scenario: Only deletions - no insertions
    Given CriticMarkup markdown:
      """
      {--first deletion--}[^ct-1] middle {--second deletion--}[^ct-2] end.

      [^ct-1]: @alice | 2026-01-15 | del | proposed
      [^ct-2]: @bob | 2026-01-15 | del | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 0 insertions
    And the export stats show 2 deletions

  @edge @fast
  Scenario: Only insertions - no deletions
    Given CriticMarkup markdown:
      """
      {++first++}[^ct-1] middle {++second++}[^ct-2] end.

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the export stats show 2 insertions
    And the export stats show 0 deletions

  @edge @fast
  Scenario: Document with only highlights and comments
    Given CriticMarkup markdown:
      """
      Text with {==highlighted==}{>>comment one<<}[^ct-1] and {==more highlighted==}{>>comment two<<}[^ct-2].

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      [^ct-2]: @bob | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked" and comments "all"
    Then the export succeeds
    And the export stats show at least 2 comments

  @edge @fast
  Scenario: Special characters in change text - quotes and ampersands
    Given CriticMarkup markdown:
      """
      {++Text with "quotes" & <angles> and 'apostrophes'++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I export to DOCX with mode "tracked"
    Then the export succeeds
    And the DOCX is a valid ZIP file
    And the export stats show 1 insertion

  @edge @fast
  Scenario: Invalid export mode is rejected
    Given CriticMarkup markdown:
      """
      {++hello++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I try to export to DOCX with mode "bogus"
    Then the export fails with error containing "Invalid export mode"

  @edge @fast
  Scenario: Invalid comment mode is rejected
    Given CriticMarkup markdown:
      """
      {++hello++}[^ct-1]

      [^ct-1]: @alice | 2026-01-15 | ins | proposed
      """
    When I try to export to DOCX with mode "tracked" and comments "garbage"
    Then the export fails with error containing "Invalid comment mode"
