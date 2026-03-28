@slow @J8 @fixture(journey-review-target)
Feature: Changes tab — triage and actions at a glance
  As a document reviewer
  I want a single panel that shows me what's happening and lets me act
  So I don't have to hunt across multiple UI surfaces

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I open the ChangeDown sidebar

  Scenario: Change cards display with metadata
    Then the Review Panel shows change cards

  # WebView iframe interaction tests — originally @wip pending reliable
  # iframe detection. Now use command-mediated panel state queries
  # (changedown._testQueryPanelState) which bypass iframe probing.

  Scenario: Click card navigates to change in editor
    When I click the text preview on a change card
    Then inline decorations are visible

  Scenario: Inline accept from panel card
    When I click the Accept button on an insertion item
    Then inline decorations are visible

  Scenario: Accept all from panel empties the list
    When I click the Accept All button in the summary section
    Then the expandable change list is empty
