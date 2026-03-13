@slow @PS1
Feature: PS1 — Panel-state synchronization
  As a reviewer
  I want the panel to always show the correct tracking and view state
  So I never see conflicting information across surfaces

  Background:
    Given I open "all-markup-types.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar

  # ── Phase 1: Toggle notifies panel ──

  Scenario: Toggle tracking updates panel immediately
    Given the tracking toggle shows "OFF"
    When I click the Tracking toggle
    Then the tracking toggle shows "ON"
    When I click the Tracking toggle
    Then the tracking toggle shows "OFF"

  # ── Phase 2: Toggle writes header ──

  Scenario: Toggle writes tracking header into document
    Given I open "no-header.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    When I click the Tracking toggle
    Then the document contains "<!-- ctrcks.com/v1:"

  Scenario: Toggle updates existing header
    Given I open "tracked-fixture.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    When I click the Tracking toggle
    Then the document contains "<!-- ctrcks.com/v1: untracked -->"
    And the document does not contain "<!-- ctrcks.com/v1: tracked -->"

  Scenario: Header is not wrapped in CriticMarkup
    Given I open "no-header.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    When I click the Tracking toggle
    Then the document contains "<!-- ctrcks.com/v1:"
    And the document does not contain "{++<!--"

  # ── Phase 2: File open reflects header state ──

  Scenario: Panel shows tracking ON when file has tracked header
    Given I open "tracked-fixture.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    Then the tracking toggle shows "ON"

  Scenario: Panel shows tracking OFF when file has untracked header
    Given I open "untracked-fixture.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    Then the tracking toggle shows "OFF"

  # ── Phase 2: File switch ──

  Scenario: Panel updates tracking state when switching files
    Given I open "tracked-fixture.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    Then the tracking toggle shows "ON"
    When I open "untracked-fixture.md" in VS Code
    And I wait 500 milliseconds
    Then the tracking toggle shows "OFF"

  # ── Phase 3: Config-based tracking ──

  @wip
  Scenario: Panel shows tracking from project config when no header exists
    Given .changetracks/config.toml has tracking.default = "tracked"
    And I open "no-header.md" which has no tracking header
    Then the review panel shows tracking as "ON"

  @wip
  Scenario: Config change propagates to panel
    Given .changetracks/config.toml has tracking.default = "tracked"
    And I open "no-header.md" which has no tracking header
    And the review panel shows tracking as "ON"
    When .changetracks/config.toml changes tracking.default to "untracked"
    Then the review panel shows tracking as "OFF"

  # ── Phase 4: Cross-surface consistency ──

  Scenario: Decorations and panel never show conflicting state
    Given I open "tracked-fixture.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    And I wait for changes to load
    Then the Review Panel shows change cards

  Scenario: View mode buttons reflect current mode on open
    Given I open "all-markup-types.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    Then the active view mode is "all-markup"

  Scenario: Cycling view mode updates panel immediately
    Given I open "all-markup-types.md" in VS Code
    And the ChangeTracks extension is active
    And I open the ChangeTracks sidebar
    When I toggle Smart View
    Then the active view mode is "changes"
