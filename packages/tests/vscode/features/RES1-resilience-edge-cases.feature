@wip @coverage-gap @red @slow @RES1
Feature: RES1 — Resilience and edge cases
  As a VS Code user
  I want ChangeDown to handle edge cases gracefully
  So the extension never crashes or produces corrupt state

  # ── Rapid view mode cycling ──────────────────────────────────

  @fixture(all-markup-types)
  Scenario: RES1-01 Rapid view mode cycling leaves no stale decorations
    Given I open "all-markup-types.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    When I toggle Smart View
    And I toggle Smart View
    And I toggle Smart View
    And I toggle Smart View
    Then inline decorations are visible
    And delimiters are visible

  # ── Rapid tracking toggle ────────────────────────────────────

  @fixture(tracking-mode-test) @destructive
  Scenario: RES1-02 Rapid tracking toggle produces clean state
    Given I open "tracking-mode-test.md" in VS Code
    And the ChangeDown extension is active
    And I open the ChangeDown sidebar
    When I click the Tracking toggle
    And I click the Tracking toggle
    And I click the Tracking toggle
    Then the tracking toggle shows "ON"

  # ── Accept on empty document ─────────────────────────────────

  @fixture(no-header)
  Scenario: RES1-03 Accept all on empty document does nothing
    Given I open "no-header.md" in VS Code
    And the ChangeDown extension is active
    When I accept all changes
    And I wait 500 milliseconds
    Then no decorations are visible

  # ── Reject on empty document ─────────────────────────────────

  @fixture(no-header)
  Scenario: RES1-04 Reject all on empty document does nothing
    Given I open "no-header.md" in VS Code
    And the ChangeDown extension is active
    When I reject all changes
    And I wait 500 milliseconds
    Then no decorations are visible

  # ── Extension activation ─────────────────────────────────────

  @fixture(tracked-fixture)
  Scenario: RES1-05 Extension activates on tracked markdown file
    Given I open "tracked-fixture.md" in VS Code
    And the ChangeDown extension is active
    Then the status bar shows "change"

  # ── Large document ───────────────────────────────────────────

  @fixture(all-markup-types)
  Scenario: RES1-06 Large fixture with many change types renders
    Given I open "all-markup-types.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    Then inline decorations are visible
    And CodeLens elements are present
