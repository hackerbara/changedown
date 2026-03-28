@slow @J4 @destructive @fixture(journey-accept-reject)
Feature: Accept/reject changes from all entry points
  As a document reviewer
  I want to accept or reject changes from any UI surface
  So I can use whichever workflow is most convenient

  Background:
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  Scenario: Accept insertion via keyboard
    When I navigate to the next change
    And I accept the change at cursor
    Then the document does not contain "{++"

  Scenario: Reject deletion via keyboard
    When I move the cursor inside the deletion change
    And I reject the change at cursor
    Then the document does not contain "{--"

  Scenario: Accept all changes
    When I accept all changes
    Then the document does not contain "{++"
    And the document does not contain "{--"
    And the document does not contain "{~~"
