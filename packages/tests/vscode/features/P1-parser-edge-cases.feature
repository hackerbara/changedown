@fast @P1
Feature: Parser edge cases — malformed and unusual CriticMarkup
  As a developer
  I want the parser to handle edge cases gracefully
  So I don't get crashes on real-world documents

  Scenario: Empty document
    Given the input text is:
      """
      """
    When I parse the text
    Then no changes are found

  Scenario: Document with no markup
    Given the input text is:
      """
      Just a normal paragraph with no changes.
      """
    When I parse the text
    Then no changes are found

  Scenario: Single insertion
    Given the input text is:
      """
      Hello {++world++}!
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has modified text "world"

  Scenario: Single deletion
    Given the input text is:
      """
      Hello {--world--}!
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a deletion
    And change 1 has original text "world"

  Scenario: Single substitution
    Given the input text is:
      """
      Hello {~~old~>new~~}!
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a substitution
    And change 1 has original text "old"
    And change 1 has modified text "new"

  Scenario: Adjacent insertions
    Given the input text is:
      """
      {++first++}{++second++}
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 is an insertion
    And change 2 is an insertion
    And change 1 has modified text "first"
    And change 2 has modified text "second"

  Scenario: Unclosed delimiter
    Given the input text is:
      """
      This has an {++unclosed insertion
      """
    When I parse the text
    Then no changes are found

  Scenario: Multi-line insertion
    Given the input text is:
      """
      Start {++this spans
      multiple lines++} end
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion

  Scenario: All five types in one document
    Given the input text is:
      """
      {++insert++} {--delete--} {~~old~>new~~} {==highlight==} {>>comment<<}
      """
    When I parse the text
    Then the parser finds 5 changes
    And change 1 is an insertion
    And change 2 is a deletion
    And change 3 is a substitution
    And change 4 is a highlight
    And change 5 is a comment
