@wip @coverage-gap @red @slow @CL1 @fixture(journey-review-target)
Feature: CL1 — CodeLens providers (Accept/Reject + Move)
  As a document reviewer
  I want Accept/Reject links above each change and directional links on moves
  So I can act on changes directly from the editor

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── CodeLens presence ────────────────────────────────────────

  Scenario: CL1-01 CodeLens elements appear on document with changes
    Then CodeLens elements are present

  Scenario: CL1-02 CodeLens appears above insertion
    When I navigate to the next change
    Then CodeLens elements are present

  Scenario: CL1-03 CodeLens appears above deletion
    When I navigate to the next change
    And I navigate to the next change
    Then CodeLens elements are present

  Scenario: CL1-04 CodeLens appears above substitution
    When I position the cursor at line 21 column 5
    Then CodeLens elements are present

  # ── CodeLens click actions ───────────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: CL1-05 Accept via command removes insertion markup
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I navigate to the next change
    And I accept the change at cursor
    Then the editor text does not contain "{++"

  @fixture(journey-accept-reject) @destructive
  Scenario: CL1-06 Reject via command restores deletion content
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I navigate to the next change
    And I navigate to the next change
    And I reject the change at cursor
    And I wait 500 milliseconds
    Then the editor text does not contain "{--"

  # ── CodeLens count ───────────────────────────────────────────

  Scenario: CL1-07 CodeLens count matches change count
    Then CodeLens elements are present
    And I open the ChangeTracks sidebar
    And the Review Panel shows change cards
    # Both surfaces should show same number of changes

  # ── CodeLens updates after action ────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: CL1-08 CodeLens updates after accept
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I accept all changes
    And I wait 500 milliseconds
    Then the editor text does not contain "{++"

  # ── No changes ───────────────────────────────────────────────

  @fixture(no-header)
  Scenario: CL1-09 No CodeLens on document with no changes
    Given I open "no-header.md" in VS Code
    And the ChangeTracks extension is active
    And I wait 500 milliseconds
    Then no decorations are visible

  # ── Move CodeLens ────────────────────────────────────────────

  @fixture(journey-move-ops)
  Scenario: CL1-10 Move CodeLens shows directional navigation
    Given I open "journey-move-ops.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    Then CodeLens elements are present
