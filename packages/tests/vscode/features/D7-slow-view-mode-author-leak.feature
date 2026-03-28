@slow @D7 @fixture(multi-author-view-switch)
Feature: D7-slow -- View mode switching clears author decorations (E2E)
  End-to-end verification that per-author colored text is properly
  cleared when switching to final/original mode in a real VS Code editor.

  Background:
    Given I open "multi-author-view-switch.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  Scenario: All-markup shows colored decorations for multi-author changes
    When I switch to "all-markup" view mode
    Then decorations include colored spans for change types

  Scenario: All-markup → Final removes all colored text decorations
    When I switch to "all-markup" view mode
    Then decorations include colored spans for change types
    When I switch to "final" view mode
    Then no colored text decorations remain
    And delimiters are hidden via display:none

  Scenario: Final → All-markup restores colored decorations
    When I switch to "final" view mode
    Then no colored text decorations remain
    When I switch to "all-markup" view mode
    Then decorations include colored spans for change types

  Scenario: All-markup → Original removes all colored text decorations
    When I switch to "all-markup" view mode
    Then decorations include colored spans for change types
    When I switch to "original" view mode
    Then no colored text decorations remain

  Scenario: Rapid cycling does not leave stale author-colored text
    When I switch to "all-markup" view mode
    And I switch to "simple" view mode
    And I switch to "final" view mode
    And I switch to "original" view mode
    And I switch to "all-markup" view mode
    Then decorations include colored spans for change types
    When I switch to "final" view mode
    Then no colored text decorations remain
