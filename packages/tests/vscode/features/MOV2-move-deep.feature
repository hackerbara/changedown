@wip @coverage-gap @red @slow @MOV2 @fixture(journey-move-ops) @destructive
Feature: MOV2 — Move operations deep coverage
  As a document author
  I want cut/paste move operations to create linked tracked changes
  So reviewers can see where content was moved from and to

  Background:
    Given I open "journey-move-ops.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I position the cursor at line 1 column 1

  # ── Move pair structure ──────────────────────────────────────

  Scenario: MOV2-01 Move fixture contains linked from/to pair
    Then the document contains "[^cn-20.1]"
    And the document contains "[^cn-20.2]"
    And the document contains "[^cn-20]"

  Scenario: MOV2-02 Move from-side is a deletion
    Then the document contains "{--"
    And the document contains "[^cn-20.1]"

  Scenario: MOV2-03 Move to-side is an insertion
    Then the document contains "{++"
    And the document contains "[^cn-20.2]"

  # ── Navigation between move pair ─────────────────────────────

  Scenario: MOV2-04 Go to linked change navigates from->to
    When I navigate to the next change
    And I navigate to the next change
    And I navigate to the next change
    And I navigate to the next change
    And I navigate to the next change
    And I navigate to the next change
    And I record the cursor line
    And I execute "ChangeDown: Go to Linked Change"
    Then the cursor moved to a different line

  Scenario: MOV2-05 Go to linked change navigates to->from
    When I navigate to the next change
    And I navigate to the next change
    And I record the cursor line
    And I execute "ChangeDown: Go to Linked Change"
    Then the cursor moved to a different line

  # ── CodeLens for moves ───────────────────────────────────────

  Scenario: MOV2-06 CodeLens shows directional labels for move operations
    Then CodeLens elements are present

  # ── Accept on one side ───────────────────────────────────────

  Scenario: MOV2-07 Accept insertion side preserves move content
    When I navigate to the next change
    And I navigate to the next change
    And I accept the change at cursor
    And I wait for changes to load
    Then the document contains "key findings"

  # ── Second move pair ─────────────────────────────────────────

  Scenario: MOV2-08 Second move pair has separate linked IDs
    Then the document contains "[^cn-23.1]"
    And the document contains "[^cn-23.2]"
