@fast @LSP4
Feature: LSP4 - Diagnostics
  The LSP diagnostics capability converts CriticMarkup changes into Hint-level
  diagnostics that appear in the problems panel. Each change produces a
  diagnostic with a human-readable message and change metadata.

  Scenario: Insertion produces a Hint diagnostic
    Given the document text "Hello {++world++}!"
    And a parsed insertion "change-1" at 6-17 with content 9-14
    When I create diagnostics
    Then there is 1 diagnostic
    And diagnostic 1 has severity "Hint"
    And diagnostic 1 has message "Insertion: world"
    And diagnostic 1 has source "changedown"

  Scenario: Deletion diagnostic message
    Given the document text "Hello {--world--}!"
    And a parsed deletion "change-2" at 6-17 with content 9-14
    When I create diagnostics
    Then diagnostic 1 has message "Deletion: world"

  Scenario: Substitution diagnostic shows arrow between old and new
    Given the document text "Hello {~~world~>universe~~}!"
    And a parsed substitution "change-3" at 6-27 with original 9-14 and modified 16-24
    When I create diagnostics
    Then diagnostic 1 has message "Substitution: world → universe"

  Scenario: Highlight diagnostic message
    Given the document text "Hello {==world==}!"
    And a parsed highlight "change-4" at 6-17 with content 9-14
    When I create diagnostics
    Then diagnostic 1 has message "Highlight: world"

  Scenario: Comment diagnostic message
    Given the document text "Hello {>>this is a note<<}!"
    And a parsed comment "change-5" at 6-26 with content 9-23
    When I create diagnostics
    Then diagnostic 1 has message "Comment: this is a note"

  Scenario: Long content is truncated with ellipsis
    Given the document text with a 100-character insertion
    When I create diagnostics
    Then diagnostic 1 message ends with "..."
    And diagnostic 1 message is shorter than 150 characters

  Scenario: Empty document produces no diagnostics
    Given the document text "Plain text with no changes"
    And no parsed changes
    When I create diagnostics
    Then there are 0 diagnostics
