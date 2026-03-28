@slow @J6 @fixture(journey-review-target)
Feature: Using SCM diff to understand net changes
  As a document reviewer
  I want to see a clean diff of the net changes
  So I understand the cumulative effect without reading inline markup

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  Scenario: Diff command opens a diff editor
    When I execute "ChangeDown: Show Diff"
    Then a diff editor is open
