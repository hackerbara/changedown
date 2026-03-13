@slow @J7 @fixture(journey-review-target)
Feature: All surfaces stay synchronized after state changes
  As a document reviewer
  I want all UI surfaces to update together
  So I have a consistent view regardless of which panel I look at

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario: Accept changes reflects across surfaces
    When I accept all changes
    Then all surfaces reflect the change was accepted
    And the document does not contain "{++"
