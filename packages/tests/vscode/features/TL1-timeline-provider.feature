@wip @coverage-gap @red @slow @TL1 @fixture(journey-review-target)
Feature: TL1 — Change Timeline Provider
  As a document reviewer
  I want to see a timeline of changes in the Explorer panel
  So I can understand the history of edits at a glance

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  # ── Timeline visibility ──────────────────────────────────────

  Scenario: TL1-01 Timeline panel shows entries for footnoted changes
    When I execute "Timeline: Focus on Timeline View"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # Timeline should show entries — verify via Timeline panel DOM

  # ── Level filtering ──────────────────────────────────────────

  @fixture(all-markup-types)
  Scenario: TL1-02 Level 0 changes excluded from timeline
    Given I open "all-markup-types.md" in VS Code
    And the ChangeDown extension is active
    When I execute "Timeline: Focus on Timeline View"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # all-markup-types.md has Level 0 changes — they should NOT appear

  # ── Sorting ──────────────────────────────────────────────────

  Scenario: TL1-03 Timeline entries appear for document with footnotes
    When I execute "Timeline: Focus on Timeline View"
    And I wait 1000 milliseconds
    Then inline decorations are visible
    # journey-review-target.md has 12 footnoted changes with dates

  # ── Empty timeline ───────────────────────────────────────────

  @fixture(no-header)
  Scenario: TL1-04 Timeline empty for document with no footnoted changes
    Given I open "no-header.md" in VS Code
    And the ChangeDown extension is active
    When I execute "Timeline: Focus on Timeline View"
    And I wait 1000 milliseconds
    Then the status bar shows "No changes"

  # ── Click navigation ────────────────────────────────────────

  Scenario: TL1-05 Timeline item reveals change in editor
    When I record the cursor line
    And I navigate to the next change
    Then the cursor moved to a different line

  # ── Discussion entries ───────────────────────────────────────

  Scenario: TL1-06 Discussion entries visible in timeline
    When I execute "Timeline: Focus on Timeline View"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # Footnotes sc-1 and sc-8 have discussion entries with replies

  # ── Timeline updates ────────────────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: TL1-07 Timeline updates after accepting a change
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    When I accept all changes
    And I wait 500 milliseconds
    Then the editor text does not contain "{++"

  Scenario: TL1-08 Timeline shows author name on entries
    When I execute "Timeline: Focus on Timeline View"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # Entries should show @alice, @bob as authors
