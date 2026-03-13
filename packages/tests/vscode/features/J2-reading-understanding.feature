@slow @J2 @fixture(journey-review-target)
Feature: Understanding the reasoning behind a change
  As a document reviewer
  I want to see why a change was made and who made it
  So I can evaluate whether to accept or reject it

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario: View modes affect reading comprehension
    When I switch to "simple" view mode
    Then inline decorations are visible
    When I switch to "final" view mode
    Then delimiters are hidden via display:none
