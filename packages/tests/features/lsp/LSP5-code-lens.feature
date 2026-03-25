@fast @LSP5
Feature: LSP5 - Code Lenses
  The LSP code lens capability shows inline Accept/Reject buttons above each
  CriticMarkup change and document-level Accept All/Reject All lenses at the
  top of the document.

  Scenario: No changes produces no lenses
    Given the document text "Some text without changes"
    And no parsed changes
    When I create code lenses
    Then there are 0 code lenses

  Scenario: Single change produces per-change lenses
    Given the document text "{++added text++}"
    And a parsed insertion "change-1" at 0-16 with content 3-13
    When I create code lenses
    Then there are 2 code lenses
    And there is an "Accept" lens for "change-1"
    And there is a "Reject" lens for "change-1"

  Scenario: Two changes produce per-change lenses for each
    Given the document text "{++added text++}\n{--removed text--}"
    And a parsed insertion "change-1" at 0-16 with content 3-13
    And a parsed deletion "change-2" at 17-35 with content 20-32
    When I create code lenses
    Then there are 4 code lenses
    And there is an "Accept" lens for "change-1"
    And there is a "Reject" lens for "change-1"
    And there is an "Accept" lens for "change-2"
    And there is a "Reject" lens for "change-2"

  Scenario: Per-change lenses are positioned at the change start line
    Given the document text "line1\n{++multi-line\ntext++}"
    And a parsed insertion "change-3" at 6-27 with content 9-24
    When I create code lenses
    Then the "Accept" lens for "change-3" is at line 1
    And the "Reject" lens for "change-3" is at line 1

  Scenario: Per-change lenses are positioned at line 0 for first-line changes
    Given the document text "{++text++}"
    And a parsed insertion "change-1" at 0-10 with content 3-8
    When I create code lenses
    Then the "Accept" lens for "change-1" is at line 0
    And the "Reject" lens for "change-1" is at line 0
