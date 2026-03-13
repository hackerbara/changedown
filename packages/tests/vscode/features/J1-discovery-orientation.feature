@slow @J1 @fixture(journey-review-target)
Feature: Discovering and orienting to changes in a document
  As a document reviewer
  I want to quickly understand what changes exist and where they are
  So I can plan my review

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario: First impressions — what tells me changes exist?
    Then the status bar shows "changes"
    And inline decorations are visible
    And CodeLens elements are present

  Scenario: Navigating via Next/Previous Change moves the cursor
    When I position the cursor at line 1 column 1
    And I record the cursor line
    When I navigate to the next change
    Then the cursor moved to a different line
    And inline decorations are visible
    When I navigate to the next change
    Then the cursor moved to a different line
    When I navigate to the previous change
    Then the cursor moved to a different line

  Scenario: Smart View for reading flow
    When I toggle Smart View
    Then inline decorations are visible
