  # @wip — Entire feature blocked. Required @slow step definitions do not exist:
  #
  # Missing steps for ALL 6 scenarios:
  #   - "Given tracking mode is OFF" (different from "tracking is currently OFF" which uses panel query)
  #   - "When tracking mode is turned ON" (mid-scenario toggle, different from Given)
  #   - "Given I have a markdown file open" (not implemented)
  #   - "Then the status bar item is visible" (not implemented — current status bar step
  #     only asserts text content, not visibility)
  #   - "When I switch to a non-markdown file" (file switching not implemented)
  #   - "Then the status bar item is still visible (extension-level, not file-level)" (not implemented)
  #   - "When I click the status bar item" (Playwright cannot reliably click VS Code
  #     status bar items — they require exact selector targeting and the status bar
  #     DOM structure varies between VS Code versions)
  #   - "Then the Explorer sidebar opens (if not already open)" (not implemented)
  #   - "Given the Explorer sidebar is open but a different section is expanded" (not implemented)
  #   - "Then the ChangeTracks panel scrolls into view and expands" (not implemented)
  #   - "Then NO QuickPick menu appears" (negative assertion on QuickPick not implemented)
  #   - "When I hover over the status bar item" (tooltip probing unreliable in Playwright)
  #   - "Then the tooltip shows:" (data table tooltip assertion not implemented)
  #
  # The status bar text content IS testable via "the status bar shows {string}" (exists
  # in interaction.steps.ts), but J11 scenarios require status bar item visibility,
  # click behavior, and tooltip probing which are fundamentally different assertions.
@wip
Feature: Status bar — minimal indicator and panel opener
  As a user
  I want the status bar to tell me if tracking is on and let me open the panel
  So I have a persistent, unobtrusive presence indicator

  Background:
    Given the ChangeTracks extension is active

  # ── Display ──

  Scenario: Status bar shows tracking state
    Given tracking mode is OFF
    Then the status bar shows "ChangeTracks"
    When tracking mode is turned ON
    Then the status bar shows "ChangeTracks ✓"

  Scenario: Status bar is always visible for markdown files
    Given I have a markdown file open
    Then the status bar item is visible
    When I switch to a non-markdown file
    Then the status bar item is still visible (extension-level, not file-level)

  # ── Click Behavior ──

  Scenario: Click opens the panel
    When I click the status bar item
    Then the Explorer sidebar opens (if not already open)
    And the ChangeTracks Changes tab is focused/revealed

  Scenario: Click when panel is already visible focuses it
    Given the Explorer sidebar is open but a different section is expanded
    When I click the status bar item
    Then the ChangeTracks panel scrolls into view and expands

  # ── QuickPick Removal ──

  Scenario: No QuickPick menu on click
    When I click the status bar item
    Then NO QuickPick menu appears
    And the panel opens instead

  # ── Tooltip ──

  Scenario: Tooltip shows brief summary
    When I hover over the status bar item
    Then the tooltip shows:
      | Line                       |
      | ChangeTracks               |
      | Tracking: ON               |
      | Click to open panel        |
