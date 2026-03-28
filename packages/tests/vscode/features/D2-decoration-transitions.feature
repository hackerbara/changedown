@slow @D2 @fixture(decoration-baseline-matrix)
Feature: Decoration transitions — view mode switching
  As a reviewer
  I want decorations to update correctly when I switch view modes
  So I don't see stale or incorrect decoration state

  Background:
    Given I open "decoration-baseline-matrix.md" in VS Code
    And the ChangeDown extension is active
    And I wait for changes to load

  Scenario: All Markup → Simple hides delimiters
    When I switch to "all-markup" view mode
    Then delimiters are visible
    When I switch to "simple" view mode
    Then delimiters are hidden via display:none
    And inline decorations are visible

  Scenario: Simple → Final hides all delimiters and content
    When I switch to "simple" view mode
    Then inline decorations are visible
    When I switch to "final" view mode
    Then delimiters are hidden via display:none

  Scenario: Final → Original maintains hidden delimiters
    When I switch to "final" view mode
    When I switch to "original" view mode
    Then delimiters are hidden via display:none

  Scenario: Original → All Markup restores full decorations
    When I switch to "original" view mode
    When I switch to "all-markup" view mode
    Then inline decorations are visible
    And delimiters are visible

  Scenario: Rapid view mode cycling does not leave stale decorations
    When I switch to "all-markup" view mode
    And I switch to "simple" view mode
    And I switch to "final" view mode
    And I switch to "original" view mode
    And I switch to "all-markup" view mode
    Then inline decorations are visible
    And delimiters are visible

  Scenario: Cursor unfolding in Simple view
    When I switch to "simple" view mode
    Then delimiters are hidden via display:none
    When I move the cursor inside the insertion change
    Then decorations are visible on the insertion change

  Scenario: Cursor leaving change in Simple refolds delimiters
    When I switch to "simple" view mode
    When I move the cursor inside the insertion change
    When I move the cursor outside the insertion change
    Then delimiters are hidden via display:none

  # Accept/reject decoration updates are tested in J4.
  # The getEditorText helper picks up CodeLens overlay text,
  # making textContent-based assertions unreliable when CodeLens is active.
