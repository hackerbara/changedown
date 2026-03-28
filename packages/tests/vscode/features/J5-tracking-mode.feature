@slow @J5 @fixture(tracking-mode-test) @destructive
Feature: Creating tracked changes via tracking mode
  As a document author
  I want my edits automatically tracked as CriticMarkup
  So my changes are reviewable by others

  Background:
    Given I open "tracking-mode-test.md" in VS Code
    And the editor is reset to the fixture
    And the ChangeDown extension is active

  Scenario: Typed text in tracking mode produces full insertion markup
    When I position the cursor at line 3 column 1
    And tracking mode is enabled
    And I type "hello" into the editor
    And I wait for edit boundary detection
    Then the document contains "{++hello++}"

  Scenario: Separate edits after pause create distinct changes
    When I position the cursor at line 3 column 1
    And tracking mode is enabled
    And I type "first" into the editor
    And I wait for edit boundary detection
    And I type "second" into the editor
    And I wait for edit boundary detection
    Then the document contains "{++first++}"
    And the document contains "{++second++}"
