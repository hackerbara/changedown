@wip @coverage-gap @red @slow @SCM1 @fixture(journey-review-target)
Feature: SCM1 — SCM / QuickDiff integration
  As a document reviewer
  I want ChangeTracks to integrate with VS Code's Source Control panel
  So I can see changed files and gutter diff indicators

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Provider registration ────────────────────────────────────

  Scenario: SCM1-01 Source Control panel shows ChangeTracks provider
    When I execute "View: Show Source Control"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # SCM provider "ChangeTracks" should be registered

  # ── Resource group ───────────────────────────────────────────

  Scenario: SCM1-02 Resource group lists files with pending changes
    When I execute "View: Show Source Control"
    And I wait 1000 milliseconds
    Then inline decorations are visible
    # Resource group should contain at least 1 file

  # ── QuickDiff ────────────────────────────────────────────────

  Scenario: SCM1-03 QuickDiff gutter indicators on markdown files
    Then inline decorations are visible
    # QuickDiff provides gutter indicators (green/red bars) for changes

  # ── Diff view ────────────────────────────────────────────────

  Scenario: SCM1-04 Show Diff opens diff editor
    When I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then a diff editor is open

  # ── Non-markdown exclusion ───────────────────────────────────

  Scenario: SCM1-05 No QuickDiff for non-markdown files
    When I execute "View: Show Source Control"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # QuickDiff should only apply to .md files

  # ── Update after accept ──────────────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: SCM1-06 SCM updates after accept all
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I accept all changes
    And I wait 1000 milliseconds
    Then the editor text does not contain "{++"

  # ── Commands registered ──────────────────────────────────────

  Scenario: SCM1-07 SCM commands are registered
    When I execute "ChangeTracks: Show Diff"
    And I wait 1000 milliseconds
    Then a diff editor is open

  # ── Badge count ──────────────────────────────────────────────

  Scenario: SCM1-08 Badge reflects number of changed files
    When I execute "View: Show Source Control"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
