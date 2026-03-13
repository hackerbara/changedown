@wip @coverage-gap @red @slow @DIFF1 @fixture(journey-review-target)
Feature: DIFF1 — Diff view and resolved content provider
  As a document reviewer
  I want to see a clean diff of net changes
  So I can understand the overall impact without reading raw markup

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Diff opens ───────────────────────────────────────────────

  Scenario: DIFF1-01 Show Diff command opens side-by-side diff editor
    When I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then a diff editor is open

  Scenario: DIFF1-02 Diff editor shows two panes
    When I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then a diff editor is open
    And the status bar shows "changes"

  # ── Content correctness ──────────────────────────────────────

  Scenario: DIFF1-03 Diff shows settled text on left pane
    When I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then a diff editor is open
    # Left pane (resolved) should NOT contain CriticMarkup delimiters

  # ── Diff after accept ────────────────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: DIFF1-04 Diff updates after accepting a change
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I accept all changes
    And I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then a diff editor is open

  # ── Empty diff ───────────────────────────────────────────────

  @fixture(no-header)
  Scenario: DIFF1-05 Diff on file with no changes shows no differences
    Given I open "no-header.md" in VS Code
    And the ChangeTracks extension is active
    When I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then the status bar shows "No changes"
