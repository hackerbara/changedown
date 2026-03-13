@slow @J12 @fixture(journey-accept-status)
Feature: Panel stays synchronized with all other surfaces
  As a reviewer
  I want the panel to reflect the same state as inline decorations and comment threads
  So I never see conflicting information

  Background:
    Given I open "journey-accept-status.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario: Accept updates editor and comments
    When I move the cursor inside the insertion change
    And I accept the change at cursor
    Then all surfaces reflect the change was accepted
    And the document contains "Rate limiting is enabled for all public endpoints."
    And the document does not contain "{++Rate limiting"

  Scenario: Accept all clears all surfaces
    When I accept all changes
    Then all surfaces reflect the change was accepted
    And the document does not contain "{++"
    And the document does not contain "{--"
