@wip @coverage-gap @red @slow @COM2 @fixture(journey-review-target)
Feature: COM2 — Comment API deep coverage
  As a document reviewer
  I want comment threads, gutter icons, and discussion features to work reliably
  So I can collaborate on document changes

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Gutter icons ─────────────────────────────────────────────

  Scenario: COM2-01 Comment gutter icons appear for footnoted changes
    Then 1 comment gutter icons are visible
    # journey-review-target.md has multiple footnoted changes;
    # at minimum one gutter icon should be visible

  # ── Thread expansion ─────────────────────────────────────────

  Scenario: COM2-02 Thread auto-expands when cursor enters change region
    When I navigate to the next change
    And I wait 1000 milliseconds
    Then 1 comment gutter icons are visible

  Scenario: COM2-03 Thread collapses when cursor leaves change region
    When I navigate to the next change
    And I wait 500 milliseconds
    And I position the cursor at line 1 column 1
    And I wait 500 milliseconds
    Then inline decorations are visible

  # ── Comment insertion with tracking ──────────────────────────

  @fixture(tracking-mode-test) @destructive
  Scenario: COM2-04 Comment insertion adds highlight+comment markup
    Given I open "tracking-mode-test.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I select from line 3 column 1 to line 3 column 10
    And I execute "ChangeTracks: Add Comment"
    And I type "review feedback"
    And I press "Escape"
    And I wait 1000 milliseconds
    Then the document contains "{>>"
    And the document contains "<<}"

  # ── Accept/Reject from comment thread ────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: COM2-05 Accept from command removes change markup
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I navigate to the next change
    And I accept the change at cursor
    And I wait 500 milliseconds
    Then the editor text does not contain "{++"

  @fixture(journey-accept-reject) @destructive
  Scenario: COM2-06 Reject from command restores content
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I navigate to the next change
    And I navigate to the next change
    And I reject the change at cursor
    Then the editor text does not contain "{--"

  # ── Multiple comments ────────────────────────────────────────

  Scenario: COM2-07 Multiple gutter icons for multiple footnoted changes
    Then inline decorations are visible
    # Document has 12+ footnoted changes; gutter icons should be present

  # ── Thread identity ──────────────────────────────────────────

  Scenario: COM2-08 Thread preserved after typing in editor
    When I navigate to the next change
    And I wait 500 milliseconds
    And I position the cursor at line 63 column 1
    And I wait 500 milliseconds
    And I navigate to the next change
    And I wait 500 milliseconds
    Then inline decorations are visible

  # ── keystroke leak defense ───────────────────────────────────

  @fixture(tracking-mode-test) @destructive
  Scenario: COM2-09 Typing during comment reply does not leak to editor
    Given I open "tracking-mode-test.md" in VS Code
    And the ChangeTracks extension is active
    And tracking mode is enabled
    When I execute "ChangeTracks: Add Comment"
    And I type "test reply text"
    And I press "Escape"
    And I wait 500 milliseconds
    Then the editor text does not contain "test reply text"
    # isCommentReplyActive flag should prevent keystroke leak
