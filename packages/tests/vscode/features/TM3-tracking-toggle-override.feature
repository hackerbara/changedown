@slow @tracking @TM3 @fixture(tracking-mode-test)
Feature: TM3 -- Tracking toggle override
  When the user explicitly toggles tracking OFF, that decision must be respected.
  External signals (LSP documentState, header reads on tab switch) must not
  silently re-enable tracking. Pending edits must be abandoned, not crystallized.

  Background:
    Given a tracking-mode editor with content "Hello world."

  # ── Tab switch override ────────────────────────────────────────────

  Scenario: TM3-01 Tracking stays off after tab switch
    # Tracking is ON from the Background step.
    # User explicitly toggles it OFF.
    When I execute "ChangeTracks: Toggle Tracking"
    And I wait 500ms
    # Switch to a different fixture file (multi-tab-second.md)
    And I switch to fixture "multi-tab-second.md"
    And I wait 1000ms
    # Switch back to the original file
    And I switch to fixture "tracking-mode-test.md"
    And I wait 1000ms
    # Type text -- it should NOT be wrapped in CriticMarkup
    And I type "OVERRIDE_TEST" into the editor
    And I wait 500ms
    Then the tracked document does not contain "{++"
    And the tracked document contains "OVERRIDE_TEST"

  # ── Pending edit abandoned on toggle off ───────────────────────────
  # NOTE: @wip because the selection-confirmation gate crystallizes edits within ~5ms.
  # The test's "insert then toggle" flow can't reliably interleave between
  # crystallization and toggle. Needs a dedicated bridge command to test pending edit abandon.
  @wip
  Scenario: TM3-02 Pending edit abandoned when tracking toggled off
    # Tracking is ON from the Background step.
    # Insert text WITHOUT waiting for crystallization.
    When I insert " PENDING" at the end
    # Immediately toggle tracking OFF before the pause threshold fires.
    And I execute "ChangeTracks: Toggle Tracking"
    # Wait longer than the default pause threshold (300ms) to let any
    # pending timer fire -- it should have been abandoned.
    And I wait 1000ms
    # The inserted text should be present but NOT wrapped in CriticMarkup.
    Then the tracked document does not contain "{++"
    And the tracked document contains "PENDING"

  # ── Smart View toggle does not re-enable tracking ──────────────────

  Scenario: TM3-03 Tracking stays off after Smart View toggle
    # Tracking is ON from the Background step.
    # User explicitly toggles tracking OFF.
    When I execute "ChangeTracks: Toggle Tracking"
    And I wait 500ms
    # Toggle Smart View (cycles view mode). This should not re-enable tracking.
    And I toggle Smart View
    And I wait 500ms
    # Type text -- it should NOT be wrapped in CriticMarkup.
    And I type "SMARTVIEW_TEST" into the editor
    And I wait 500ms
    Then the tracked document does not contain "{++"
    And the tracked document contains "SMARTVIEW_TEST"
