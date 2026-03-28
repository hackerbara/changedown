@wip @coverage-gap @red @slow @PNL3 @fixture(journey-review-target)
Feature: PNL3 — Review panel deep coverage
  As a document reviewer
  I want the review panel to show accurate summaries, cards, and actions
  So I can triage changes without reading raw markup

  Background:
    Given I open "journey-review-target.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I open the ChangeDown sidebar

  # ── Summary line ─────────────────────────────────────────────

  Scenario: PNL3-01 Summary shows change count breakdown
    Then the summary shows "ins"
    And the summary shows "del"

  Scenario: PNL3-02 Summary shows total change count
    Then the Review Panel shows change cards

  # ── Change cards ─────────────────────────────────────────────

  Scenario: PNL3-03 Change cards show content preview and type
    When I expand the change list
    Then I see each change listed with content preview, author, and type icon

  Scenario: PNL3-04 Each card has inline Accept and Reject buttons
    When I expand the change list
    Then each item has inline Accept and Reject buttons

  # ── Navigation from panel ────────────────────────────────────

  Scenario: PNL3-05 Next button moves cursor in editor
    When I click the Next Change button in the summary section
    Then the editor scrolls to the next change

  Scenario: PNL3-06 Previous button moves cursor in editor
    When I click the Next Change button in the summary section
    And I click the Previous Change button in the summary section
    Then the editor scrolls to the previous change

  # ── Card click navigation ────────────────────────────────────

  Scenario: PNL3-07 Click card text navigates to change in editor
    When I expand the change list
    And I click the text preview on a change card
    Then the cursor is positioned inside that change

  # ── Bulk actions ─────────────────────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: PNL3-08 Accept All from panel removes all markup
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I open the ChangeDown sidebar
    When I click the Accept All button in the summary section
    Then the change list is empty

  @fixture(journey-accept-reject) @destructive
  Scenario: PNL3-09 Reject All from panel removes all markup
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I open the ChangeDown sidebar
    When I click Reject All in the panel
    Then the change list is empty

  # ── Inline accept from card ──────────────────────────────────

  @fixture(journey-accept-reject) @destructive
  Scenario: PNL3-10 Inline accept on card decrements change count
    Given I open "journey-accept-reject.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I open the ChangeDown sidebar
    When I accept a change from the panel's change list
    Then the change count in the panel decrements

  # ── View mode from panel ─────────────────────────────────────

  Scenario: PNL3-11 View mode buttons reflect current mode on open
    Then the active view mode is "review"

  Scenario: PNL3-12 View mode switch from panel updates decorations
    When I switch to the "changes" view mode from the panel
    Then the active view mode is "changes"

  # ── Tracking toggle from panel ───────────────────────────────

  Scenario: PNL3-13 Tracking toggle from panel writes header
    When I click the Tracking toggle
    Then the tracking toggle shows "ON"

  # ── Empty state ──────────────────────────────────────────────

  @fixture(no-header)
  Scenario: PNL3-14 Empty state when document has no changes
    Given I open "no-header.md" in VS Code
    And the ChangeDown extension is active
    And I open the ChangeDown sidebar
    Then the change list is empty
