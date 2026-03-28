  # @wip — Entire feature blocked. Required @slow step definitions do not exist:
  #   - "Given I open a workspace with .changedown/config.toml" (workspace setup with config)
  #   - "Given config.toml has:" (data table → config file writing)
  #   - "Given the Explorer sidebar panel is visible" (exists as "the Explorer sidebar is visible")
  #   - "Then the Project Status header shows:" (data table → WebView header content assertion)
  #   - "Given the status header fields preference includes:" (preference configuration)
  #   - "When .changedown/config.toml is modified externally" (file watcher trigger)
  #   - "When I switch from doc-a.md to doc-b.md" (multi-file switching)
  #   - Various "Given/Then" steps for policy assertions (Tracking/Required/Amend lines)
  #
  # The ProjectStatusModel is already tested at @fast tier in PNL1-panel-state.feature
  # (12 scenarios, all passing). This feature adds E2E WebView rendering validation
  # which needs workspace-level infrastructure and WebView DOM probing.
@wip
Feature: Project status header — shared live policy display
  As a reviewer or maintainer
  I want to see the active project policies at a glance on any panel tab
  So I always know what rules are in effect without opening config files

  Background:
    Given I open a workspace with .changedown/config.toml
    And the ChangeDown extension is active
    And the Explorer sidebar panel is visible

  # ── Content and Layout ──

  Scenario: Header shows configurable status fields
    Given config.toml has:
      | Setting              | Value       |
      | tracking.default     | tracked     |
      | author.enforcement   | required    |
      | policy.amend         | same-author |
    And the status header fields preference includes: tracking, required, amend
    Then the Project Status header shows:
      | Line                          |
      | Tracking: ON (project)        |
      | Smart View: OFF               |
      | Required: author, reasoning   |
      | Amend: same-author only       |

  Scenario: Header respects configured visible fields
    Given status header fields preference is: tracking, smart view (only)
    Then the header shows only Tracking and Smart View lines
    And does NOT show Required or Amend lines

  Scenario: Header appears identically on both tabs
    When I view the Changes tab
    And I note the Project Status content
    And I switch to the Settings tab
    Then the Project Status content is identical

  # ── Tracking Source Resolution ──

  Scenario: Tracking source shows "project" when from config.toml
    Given config.toml sets tracking.default = "tracked"
    And the current file has no tracking header
    Then Tracking shows "ON (project)"

  Scenario: Tracking source shows "file" when file has header
    Given config.toml sets tracking.default = "tracked"
    And the current file has "<!-- changedown.com/v1: untracked -->"
    Then Tracking shows "OFF (file override)"

  Scenario: Tracking source shows "default" when no config exists
    Given no .changedown/config.toml exists
    And the current file has no tracking header
    Then Tracking shows "ON (default)"

  # ── Live Updates ──

  Scenario: Header updates when tracking is toggled
    Given Tracking shows "ON (project)"
    When I click the Tracking toggle
    Then Tracking shows "OFF" (session override)
    And this is a session-level toggle, not a config change

  Scenario: Header updates when smart view is toggled
    When I click the Smart View toggle
    Then Smart View updates to reflect the new state

  Scenario: Header updates when config.toml changes
    When .changedown/config.toml is modified externally
    Then the header re-reads config and updates all policy lines

  Scenario: Header updates when switching files
    Given doc-a.md has a file tracking header (untracked)
    And doc-b.md has no file tracking header
    When I switch from doc-a.md to doc-b.md
    Then Tracking source changes from "OFF (file override)" to "ON (project)"

  # ── Required Metadata Line ──

  Scenario: Shows "none" when nothing is required
    Given author.enforcement = "optional" and no reasoning requirement
    Then the Required line shows "none"

  Scenario: Shows combined requirements
    Given author.enforcement = "required" and reasoning is required
    Then the Required line shows "author, reasoning"

  Scenario: Shows only author when reasoning not required
    Given author.enforcement = "required" and reasoning is not required
    Then the Required line shows "author"

  # ── Amend Policy Line ──

  Scenario: Shows amend policy from trust cascade
    Given policy.amend = "collaborative"
    Then the Amend line shows "collaborative (others can refine)"

  Scenario: Shows same-author default
    Given policy.amend is not set (default)
    Then the Amend line shows "same-author only"
