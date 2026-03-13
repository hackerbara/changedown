@slow @MOV1 @fixture(journey-move-ops)
Feature: MOV1 — Move operations
  As a document author
  I want to reorganize content with tracked moves
  So that reviewers can see where text was moved from and to

  Background:
    Given I open "journey-move-ops.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  Scenario: Move operations are rendered with decorations
    Then inline decorations are visible

  Scenario: Go to linked change navigates between move pair
    When I navigate to the next change
    And I navigate to the next change
    And I record the cursor line
    And I execute "ChangeTracks: Go to Linked Change"
    Then the cursor moved to a different line

  Scenario: Move fixture contains linked deletion and insertion
    Then the document contains "[^ct-20.1]"
    And the document contains "[^ct-20.2]"

  Scenario: CodeLens elements are present for move operations
    Then CodeLens elements are present
