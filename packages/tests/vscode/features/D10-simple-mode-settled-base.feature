@fast @D10
Feature: D10 — Simple mode with settled-base rendering
  Simple mode uses Final-mode rendering as its base. Changes on non-cursor
  lines are hidden (deletions) or shown as plain text (insertions). When the
  cursor is on a line containing changes, all changes on that line are
  revealed with full coloring.

  # ── Cursor AWAY from changes: settled-base rendering ───────────

  Scenario: D10-01 Insertion on non-cursor line shows as plain text (no decoration)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17

  Scenario: D10-02 Deletion on non-cursor line is entirely hidden
    Given markup text "Hello {--removed text--} end"
    When I decorate in smart view mode
    Then deletions is empty
    And hiddens count is 1
    And hiddens has range 0:6 to 0:24

  Scenario: D10-03 Substitution on non-cursor line shows only new text
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in smart view mode
    Then substitutionOriginals is empty
    And substitutionModifieds is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:14
    And hiddens has range 0:17 to 0:20

  Scenario: D10-04 Comment on non-cursor line is entirely hidden
    Given markup text "Hello {>>a note<<} end"
    When I decorate in smart view mode
    Then comments is empty
    And hiddens count is 1
    And hiddens has range 0:6 to 0:18
    And commentIcons count is 1

  Scenario: D10-05 Highlight on non-cursor line shows content with highlight, hides delimiters
    Given markup text "Hello {==important==} end"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:9 to 0:18
    And hiddens count is 2

  # ── Cursor ON a change line: full reveal ───────────────────────

  Scenario: D10-06 Insertion revealed when cursor is on same line
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17

  Scenario: D10-07 Deletion revealed when cursor is on same line
    Given markup text "Hello {--removed text--} end"
    When I decorate in smart view mode with cursor at 0:10
    Then deletions count is 1
    And deletions has range 0:9 to 0:21
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:21 to 0:24

  Scenario: D10-08 Substitution revealed when cursor is on same line
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in smart view mode with cursor at 0:10
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And hiddens count is 3

  Scenario: D10-09 Comment revealed when cursor is on same line
    Given markup text "Hello {>>a note<<} end"
    When I decorate in smart view mode with cursor at 0:8
    Then hiddens count is 1
    And hiddens has range 0:6 to 0:18
    And commentIcons count is 1

  # ── Multi-line: cursor line vs non-cursor line ─────────────────

  Scenario: D10-10 Two-line document: change on line 0 hidden, cursor on line 1
    Given markup text:
      """
      Start {++added++} end
      Second line
      """
    When I decorate in smart view mode with cursor at 1:0
    Then insertions is empty
    And hiddens count is 2

  Scenario: D10-11 Two-line document: change on line 0 revealed, cursor on line 0
    Given markup text:
      """
      Start {++added++} end
      Second line
      """
    When I decorate in smart view mode with cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14

  # ── Cursor on line with deletion: line-level reveal includes all changes ─

  Scenario: D10-12 Adjacent insertion+deletion both revealed when cursor on their line
    Given markup text "{++add++}{--del--}"
    When I decorate in smart view mode with cursor at 0:4
    Then insertions count is 1
    And deletions count is 1
