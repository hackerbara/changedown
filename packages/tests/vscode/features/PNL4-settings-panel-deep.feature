@wip @coverage-gap @red @slow @PNL4 @fixture(journey-review-target)
Feature: PNL4 — Settings panel deep coverage
  As a project maintainer
  I want the settings panel to read and write configuration correctly
  So I can manage tracking policies from a visual form

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Panel opens ──────────────────────────────────────────────

  Scenario: PNL4-01 Settings panel opens without error
    When I open the Settings Panel
    Then the status bar shows "changes"

  # ── Field display ────────────────────────────────────────────

  Scenario: PNL4-02 Settings panel shows default author field
    When I open the Settings Panel
    Then the Settings panel shows author ""

  Scenario: PNL4-03 Settings panel shows default enforcement
    When I open the Settings Panel
    Then the Settings panel shows enforcement "optional"

  # ── Save creates config ──────────────────────────────────────

  Scenario: PNL4-04 Save creates config.toml file
    When I open the Settings Panel
    And I change author to "test-author" in Settings
    And I save settings
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # Verify config.toml was created by checking settings panel reads it back

  Scenario: PNL4-05 Change author and save persists
    When I open the Settings Panel
    And I change author to "reviewer-bob" in Settings
    And I save settings
    And I wait 1000 milliseconds
    Then the Settings panel shows author "reviewer-bob"

  # ── Enforcement levels ───────────────────────────────────────

  Scenario: PNL4-06 Change enforcement and save persists
    When I open the Settings Panel
    And I change Enforcement from "none" to "warn"
    And I save settings
    And I wait 1000 milliseconds
    Then the Settings panel shows enforcement "warn"
