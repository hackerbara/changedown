@integration @tracking @TM1
Feature: TM1 -- Tracking mode basic behavior
  Port of TrackingMode.test.ts (6 mocha tests).
  Tests the ExtensionController tracking mode lifecycle: toggle on/off,
  insertion wrapping, double-wrap prevention, whitespace-only filtering,
  and markdown-only enforcement.

  # ── Toggle ──────────────────────────────────────────────────────────

  Scenario: Tracking mode can be toggled on and off
    Given I open "tracking-mode-test.md" in VS Code
    When I execute "ChangeTracks: Toggle Tracking"
    And I execute "ChangeTracks: Toggle Tracking"

  # ── Wrapping insertions ─────────────────────────────────────────────

  Scenario: Tracking mode wraps insertions in CriticMarkup
    Given a tracking-mode editor with content "Initial text here."
    When I insert " NEW" at the end
    And I wait 200ms
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "{++"
    And the tracked document contains "++}"

  # ── Double-wrap prevention ──────────────────────────────────────────

  Scenario: Tracking mode does not double-wrap CriticMarkup
    Given a tracking-mode editor with content "Initial text here."
    When I insert "{++test++}" at the end
    And I wait 200ms
    Then "{++" appears exactly 1 time in the tracked document

  # ── Whitespace filtering ────────────────────────────────────────────

  Scenario: Tracking mode does not wrap whitespace-only insertions
    Given a tracking-mode editor with content "Initial text here."
    When I insert "   " at the end
    And I wait 200ms
    Then the tracked document does not contain "{++"

  # ── Toggle off stops wrapping ───────────────────────────────────────

  Scenario: Tracking mode can be disabled to stop wrapping
    Given a tracking-mode editor with content "Initial text here."
    When I execute "ChangeTracks: Toggle Tracking"
    And I insert " test" at the end
    And I wait 300ms
    Then the tracked document does not contain "{++"
    And the tracked document text is "Initial text here. test"

  # ── Markdown-only enforcement ───────────────────────────────────────

  Scenario: Tracking mode only applies to markdown files
    Given a tracking-mode editor with file-backed plain-text content "Plain text"
    When I insert " test" at the end
    And I wait 200ms
    Then the tracked document does not contain "{++"
