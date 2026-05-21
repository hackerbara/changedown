@slow @L3T @destructive @fixture(editing-example-l3-tracking)
Feature: Complex L3 load anchoring in the VS Code extension
  As a reviewer opening a complex tracked document
  I want L2-to-L3 promotion and anchor resolution to settle cleanly
  So decorations do not move from apparently placed to unresolved after the full cycle

  Scenario: Promoted complex document settles with resolved L3 anchors
    Given I open "editing-example-l3-tracking.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    Then the document contains L3 edit-op lines
    And the document body has no inline CriticMarkup
    And the complex L3 parsed anchors have settled
    And L3 deletion ghost refs are anchored at deletion seams
    Then the active complex L3 document reports tracking enabled

  Scenario: Tracked insertion after L3 promotion stays footnote-native
    Given I open "editing-example-l3-tracking.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    Then the document contains L3 edit-op lines
    And the document body has no inline CriticMarkup
    And the complex L3 parsed anchors have settled
    When I record the current complex L3 document shape
    Then the active complex L3 document reports tracking enabled
    When I insert "__L3TRACK__" after "Powered by CriticMarkup"
    And I force the pending ChangeDown edit to flush
    Then the tracked edit for "__L3TRACK__" stays L3 footnote-native
