@slow @CL4 @fixture(codelens-cursor-gating)
Feature: CL4-slow — CodeLens cursor-gating in running VS Code

  Integration tests that verify CodeLens rendering in a live VS Code instance.
  Fixture: packages/tests/vscode/fixtures/journeys/codelens-cursor-gating.md
  Contains: 2 insertions (world, earth) + 1 deletion (Goodbye) = 3 actionable changes.

  Scenario: CL4-20 CodeLens appears when cursor moves to change line
    Given VS Code is launched with fixture "codelens-cursor-gating"
    And the extension has finished parsing
    And CodeLens is enabled
    When I place the cursor on line 1 column 1
    Then CodeLens items are visible

  Scenario: CL4-21 CodeLens disappears when cursor moves away
    Given VS Code is launched with fixture "codelens-cursor-gating"
    And the extension has finished parsing
    And CodeLens is enabled
    When I place the cursor on line 2 column 1
    Then no CodeLens items are visible

  Scenario: CL4-22 Always mode shows CodeLens for all changes
    Given VS Code is launched with fixture "codelens-cursor-gating"
    And the extension has finished parsing
    And CodeLens is enabled
    When I set codeLensMode to "always"
    Then at least 3 CodeLens items are visible

  Scenario: CL4-23 Mode switching updates CodeLens live
    Given VS Code is launched with fixture "codelens-cursor-gating"
    And the extension has finished parsing
    And CodeLens is enabled
    When I set codeLensMode to "always"
    Then at least 3 CodeLens items are visible
    When I set codeLensMode to "off"
    Then no CodeLens items are visible

  Scenario: CL4-24 Off mode shows no CodeLens
    Given VS Code is launched with fixture "codelens-cursor-gating"
    And the extension has finished parsing
    When I set codeLensMode to "off"
    Then no CodeLens items are visible
