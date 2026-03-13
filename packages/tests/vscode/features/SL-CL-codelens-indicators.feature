@slow @SL-CL @wip @red
Feature: SL-CL — CodeLens lifecycle indicators in running VS Code

  Background:
    Given VS Code is launched with fixture "lifecycle-codelens.md"
    And CodeLens is enabled
    And the extension has finished parsing

  @SL-CL-01
  Scenario: Clean proposed change shows bare Accept | Reject
    Then the CodeLens for ct-1 shows "Accept | Reject"
    And the CodeLens for ct-1 does not contain discussion indicator
    And I capture evidence screenshot "codelens-clean"

  @SL-CL-02
  Scenario: Change with replies shows discussion count
    Then the CodeLens for ct-2 contains discussion indicator
    And the CodeLens for ct-2 shows reply count of 2
    And I capture evidence screenshot "codelens-discussion"

  @SL-CL-03
  Scenario: Change with request-changes shows warning indicator
    Then the CodeLens for ct-3 contains request-changes indicator
    And I capture evidence screenshot "codelens-request-changes"

  @SL-CL-04
  Scenario: Amended change shows amendment indicator
    Then the CodeLens for ct-4 contains amendment indicator
    And I capture evidence screenshot "codelens-amended"

  @SL-CL-05
  Scenario: CodeLens hidden in Final view mode
    When I set view mode to "final"
    Then no CodeLens items exist for the document
    And I capture evidence screenshot "codelens-hidden-final"
    When I set view mode to "all-markup"
    Then CodeLens items exist for ct-1, ct-2, ct-3, ct-4
    And I capture evidence screenshot "codelens-restored"
