@wip @coverage-gap @red @slow @NAV2 @fixture(journey-review-target)
Feature: NAV2 — Navigation E2E via Playwright
  As a document reviewer
  I want Next/Previous Change to move my cursor through changes
  So I can review each change in order without manual scrolling

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Next Change ──────────────────────────────────────────────

  Scenario: NAV2-01 Next change from beginning moves to first change
    When I position the cursor at line 1 column 1
    And I record the cursor line
    And I navigate to the next change
    Then the cursor moved to a different line

  Scenario: NAV2-02 Next change sequentially hits each change
    When I navigate to the next change
    And I record the cursor line
    And I navigate to the next change
    Then the cursor moved to a different line

  Scenario: NAV2-03 Next change wraps from end to first change
    When I position the cursor at line 63 column 1
    And I record the cursor line
    And I navigate to the next change
    Then the cursor moved to a different line

  # ── Previous Change ──────────────────────────────────────────

  Scenario: NAV2-04 Previous change wraps from beginning to last change
    When I position the cursor at line 1 column 1
    And I record the cursor line
    And I navigate to the previous change
    Then the cursor moved to a different line

  Scenario: NAV2-05 Previous change moves backwards through changes
    When I navigate to the next change
    And I navigate to the next change
    And I record the cursor line
    And I navigate to the previous change
    Then the cursor moved to a different line

  # ── Edge cases ───────────────────────────────────────────────

  @fixture(no-header)
  Scenario: NAV2-06 Navigation in document with no changes does nothing
    Given I open "no-header.md" in VS Code
    And the ChangeTracks extension is active
    When I position the cursor at line 1 column 1
    And I record the cursor line
    And I navigate to the next change
    # Cursor should not move — no changes to navigate to

  Scenario: NAV2-07 Navigation across all change types
    When I navigate to the next change
    Then inline decorations are visible
    When I navigate to the next change
    Then inline decorations are visible
    When I navigate to the next change
    Then inline decorations are visible

  # ── Status bar cursor ────────────────────────────────────────

  Scenario: NAV2-08 Navigation updates status bar cursor position
    When I navigate to the next change
    Then the status bar shows "Ln"
