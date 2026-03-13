@wip @coverage-gap @red @slow @MTB1 @fixture(journey-review-target)
Feature: MTB1 — Multi-tab behavior
  As a document reviewer
  I want each tab to maintain independent tracking and view mode state
  So switching between documents doesn't lose my context

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Panel state on load ────────────────────────────────────

  Scenario: MTB1-01 Panel shows changes for active document
    And I open the ChangeTracks sidebar
    Then the Review Panel shows change cards

  Scenario: MTB1-02 Status bar shows change count
    Then the status bar shows "change"

  # ── View mode independence ─────────────────────────────────

  Scenario: MTB1-03 View mode defaults to review on open
    And I open the ChangeTracks sidebar
    Then the active view mode is "review"

  Scenario: MTB1-04 View mode change persists within session
    And I open the ChangeTracks sidebar
    When I toggle Smart View
    Then the active view mode is "changes"
    When I toggle Smart View
    Then the active view mode is "settled"

  # ── Decorations per document ───────────────────────────────

  Scenario: MTB1-05 Decorations visible on tracked document
    Then inline decorations are visible

  # ── Non-markdown via new untitled ──────────────────────────
  # NOTE: Opening untitled file in same instance tests panel clearing
  # This is the closest we can get to multi-tab without new step definitions

  Scenario: MTB1-06 Panel state after new untitled file
    When I execute "workbench.action.files.newUntitledFile"
    And I wait 1000 milliseconds
    Then the status bar shows "No changes"

  # ── Return after untitled ──────────────────────────────────
  # NOTE: These scenarios document the NEED for real multi-tab step definitions
  # The test harness currently closes VS Code and relaunches on fixture change
  # True multi-tab testing requires: `When I open {string} in a new tab`

  @fixture(no-header)
  Scenario: MTB1-07 Empty document has no decorations
    Given I open "no-header.md" in VS Code
    And the ChangeTracks extension is active
    Then no decorations are visible

  @fixture(journey-accept-reject) @destructive
  Scenario: MTB1-08 Accept all removes markup in current document
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I accept all changes
    Then the editor text does not contain "{++"
