@fast @CL4
Feature: CL4 — CodeLens cursor-gated mode

  CodeLens adapts based on codeLensMode and cursor position.

  Background:
    Given a lifecycle document with text:
      """
      Line zero
      Hello {++world++}[^cn-1] and {++earth++}[^cn-2]
      Another line
      {--Goodbye--}[^cn-3]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
          @bob 2026-03-09: Looks good
          @carol 2026-03-09: Agreed
      [^cn-2]: @alice | 2026-03-09 | insertion | proposed
      [^cn-3]: @dave | 2026-03-09 | deletion | proposed
          request-changes: @eve 2026-03-09 "Keep this text"
      """

  Scenario: CL4-01 Off mode returns no lenses
    When I compute CodeLens with mode "off"
    Then the CodeLens array is empty

  Scenario: CL4-02 Cursor mode with no cursor state returns no lenses
    When I compute CodeLens with mode "cursor"
    Then the CodeLens array is empty

  Scenario: CL4-03 Cursor inside a specific change shows single Accept/Reject
    When I compute CodeLens with mode "cursor" and cursor inside "cn-1"
    Then the CodeLens array has 2 items
    And CodeLens 0 title starts with "Accept"
    And CodeLens 1 title starts with "Reject"
    And CodeLens 0 title contains "💬 2"

  Scenario: CL4-04 Cursor on line but outside changes shows Accept All / Reject All
    When I compute CodeLens with mode "cursor" and cursor on line 1 outside changes
    Then the CodeLens array has 2 items
    And CodeLens 0 title starts with "Accept All"
    And CodeLens 1 title starts with "Reject All"
    And CodeLens 0 title contains "(2)"

  Scenario: CL4-05 Cursor on line with no changes returns no lenses
    When I compute CodeLens with mode "cursor" and cursor on line 0 outside changes
    Then the CodeLens array is empty

  Scenario: CL4-06 Cursor on line with no changes (line 2) returns no lenses
    When I compute CodeLens with mode "cursor" and cursor on line 2 outside changes
    Then the CodeLens array is empty

  Scenario: CL4-07 Always mode returns lenses for all actionable changes
    When I compute CodeLens with mode "always"
    Then the CodeLens array has 6 items

  Scenario: CL4-08 Always mode includes lifecycle indicators
    When I compute CodeLens with mode "always"
    Then a CodeLens title contains "💬 2"
    And a CodeLens title contains "⚠"

  Scenario: CL4-09 No document-level Accept All in any mode
    When I compute CodeLens with mode "always"
    Then no CodeLens title starts with "Accept All"
    And no CodeLens title starts with "Reject All"

  Scenario: CL4-10 Cursor inside change with request-changes shows warning
    When I compute CodeLens with mode "cursor" and cursor inside "cn-3"
    Then the CodeLens array has 2 items
    And CodeLens 0 title contains "⚠"

  Scenario: CL4-11 Always mode multi-change line includes content snippets
    When I compute CodeLens with mode "always"
    Then a CodeLens for cn-1 title contains "world"
    And a CodeLens for cn-2 title contains "earth"
