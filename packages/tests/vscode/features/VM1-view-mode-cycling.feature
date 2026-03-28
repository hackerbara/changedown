@wip @coverage-gap @red @slow @VM1 @fixture(all-markup-types)
Feature: VM1 — View mode cycling
  As a document reviewer
  I want to cycle through view modes to see the document in different states
  So I can read the settled result, see original text, or see all markup

  Background:
    Given I open "all-markup-types.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load
    And I open the ChangeDown sidebar

  # ── Full cycle ───────────────────────────────────────────────

  Scenario: VM1-01 Cycle through all 4 modes in order
    Then the active view mode is "review"
    When I toggle Smart View
    Then the active view mode is "changes"
    When I toggle Smart View
    Then the active view mode is "settled"
    When I toggle Smart View
    Then the active view mode is "raw"
    When I toggle Smart View
    Then the active view mode is "review"

  # ── Display names ────────────────────────────────────────────

  Scenario: VM1-02 All Markup mode shows all decorations and delimiters
    Then the active view mode is "review"
    And inline decorations are visible

  Scenario: VM1-03 Simple mode hides delimiters
    When I switch to "simple" view mode
    Then the active view mode is "changes"
    And delimiters are hidden via display:none

  Scenario: VM1-04 Final mode shows settled text
    When I switch to "final" view mode
    Then the active view mode is "settled"

  Scenario: VM1-05 Original mode shows pre-change text
    When I switch to "original" view mode
    Then the active view mode is "raw"

  # ── Panel sync ───────────────────────────────────────────────

  Scenario: VM1-06 Panel buttons stay in sync with cycling
    When I toggle Smart View
    Then the active view mode is "changes"
    When I switch to the "settled" view mode from the panel
    Then the active view mode is "settled"

  # ── Decorations match mode ───────────────────────────────────

  Scenario: VM1-07 Decorations match expected state per mode
    Given the setting "showDelimiters" is true
    Then inline decorations are visible
    When I switch to "final" view mode
    Then delimiters are hidden via display:none
    When I switch to "all-markup" view mode
    Then delimiters are visible
