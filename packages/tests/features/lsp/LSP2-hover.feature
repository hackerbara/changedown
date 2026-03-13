@fast @LSP2
Feature: LSP2 - Hover Information
  The LSP hover capability shows contextual information when hovering over
  CriticMarkup changes. Comments display "Comment: ..." and changes with
  footnote reasons display "Reason: ...". Hovering outside changes or on
  changes without metadata returns nothing.

  Scenario: Hover on standalone comment shows comment text
    Given the document text "Hello {>>This is a comment<<}"
    When I hover at line 0 character 15
    Then the hover contains "**Comment:** This is a comment"

  Scenario: Hover on highlight with attached comment shows comment
    Given the document text "Hello {==world==}{>>note<<}"
    And changes include a highlight at 6-17 with comment "note"
    When I hover at line 0 character 10
    Then the hover contains "**Comment:** note"

  Scenario: Hover on highlight without comment returns nothing
    Given the document text "Hello {==world==}"
    When I hover at line 0 character 10
    Then there is no hover

  Scenario: Hover on insertion with reason shows reason
    Given the document text "Hello {++world++}"
    And changes include an insertion at 6-17 with reason "Added greeting"
    When I hover at line 0 character 10
    Then the hover contains "**Reason:** Added greeting"

  Scenario: Hover outside any change returns nothing
    Given the document text "Hello {++world++}"
    When I hover at line 0 character 0
    Then there is no hover

  Scenario: Hover on empty comment returns nothing
    Given the document text "Hello {>><<}"
    When I hover at line 0 character 8
    Then there is no hover

  Scenario: Hover on multi-line comment shows full text
    Given the document text "Hello {>>This is a\nmulti-line\ncomment<<}"
    When I hover at line 1 character 0
    Then the hover contains "multi-line"
