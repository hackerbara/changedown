@slow @J3 @fixture(journey-review-target) @destructive
Feature: Collaborative discussion on changes
  As a document collaborator
  I want to discuss changes with my team
  So we can reach consensus before accepting or rejecting

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active

  Scenario: Insert a comment on a change
    When I navigate to the next change
    And I execute "ChangeTracks: Add Comment"
    And I wait 500 milliseconds
    And I type "This needs review"
    And I press "Enter"
    Then the document contains "{>>"
    And the document contains "This needs review"
    And the document contains "<<}"
