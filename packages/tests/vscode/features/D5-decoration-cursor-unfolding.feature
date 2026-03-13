@fast @D5
Feature: D5 -- Cursor-aware unfolding in smart view mode
  Cursor-aware unfolding requires showCriticMarkup=true AND a non-review,
  non-settled, non-raw view mode (i.e. 'changes'/'simple' with CM ON).
  Smart view mode passes showCriticMarkup=false, so no unfolding occurs —
  delimiters stay hidden regardless of cursor position. The trigger zone is
  contentRange (not fullRange), so cursor on delimiter characters alone
  does not trigger unfolding even when CM is on.

  The Active State Machine scenarios (markup mode, showCriticMarkup=true)
  verify that activeHighlights still fire based on contentRange.

  # ── Smart view (showCriticMarkup=false): no unfolding, delimiters always hidden ──

  Scenario: Cursor inside insertion - delimiters stay hidden (CM off)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Cursor at opening delimiter boundary - delimiters stay hidden (CM off)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:6
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Cursor at closing delimiter boundary - delimiters stay hidden (CM off)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:17
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Cursor one char past closing delimiter - delimiters hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:18
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Cursor inside substitution - delimiters stay hidden (CM off)
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in smart view mode with cursor at 0:10
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And substitutionOriginals has range 0:9 to 0:12
    And substitutionModifieds has range 0:14 to 0:17
    And hiddens count is 3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:12 to 0:14
    And hiddens has range 0:17 to 0:20
    And unfolded is empty

  Scenario: Cursor inside standalone comment - entire node hidden, icon shown (CM off)
    Given markup text "Hello{>>feedback<<} end"
    When I decorate in smart view mode with cursor at 0:10
    Then comments is empty
    And hiddens count is 1
    And hiddens has range 0:5 to 0:19
    And unfolded is empty
    And commentIcons count is 1

  Scenario: Two changes, cursor in second - all delimiters hidden (CM off)
    Given markup text "{++add++} {--del--}"
    When I decorate in smart view mode with cursor at 0:14
    Then insertions count is 1
    And insertions has range 0:3 to 0:6
    And deletions count is 1
    And deletions has range 0:13 to 0:16
    And hiddens count is 4
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:10 to 0:13
    And hiddens has range 0:16 to 0:19
    And unfolded is empty

  # ── Multi-line: still no unfolding in smart view ──

  Scenario: Multi-line change - delimiters stay hidden (CM off)
    Given markup text:
      """
      Start
      {++added
      text++}
      End
      """
    When I decorate in smart view mode with cursor at 1:5
    Then insertions count is 1
    And insertions has range 1:3 to 2:4
    And hiddens count is 2
    And hiddens has range 1:0 to 1:3
    And hiddens has range 2:4 to 2:7
    And unfolded is empty

  # ── Highlight+comment: still no unfolding in smart view ──

  Scenario: Highlight+comment cursor - delimiters hidden, no icon (CM off, cursor on line)
    Given markup text "{==text==}{>>note<<}"
    When I decorate in smart view mode with cursor at 0:5
    Then highlights count is 1
    And highlights has range 0:3 to 0:7
    And highlights at index 0 has hover containing "note"
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:7 to 0:20
    And unfolded is empty
    And commentIcons is empty

  # ── Mocha source: Active State Machine (cursor highlight) ──

  Scenario: Cursor outside all changes - activeHighlights empty
    Given markup text "Hello {++world++} end"
    When I decorate in markup mode with cursor at 0:0
    Then activeHighlights is empty

  Scenario: Cursor inside insertion - activeHighlights contains insertion range
    Given markup text "Hello {++world++} end"
    When I decorate in markup mode with cursor at 0:10
    Then activeHighlights count is 1
    And activeHighlights has range 0:6 to 0:17

  Scenario: Cursor inside deletion - activeHighlights contains deletion range
    Given markup text "Hello {--removed--} end"
    When I decorate in markup mode with cursor at 0:10
    Then activeHighlights count is 1
    And activeHighlights has range 0:6 to 0:19

  Scenario: Cursor in substitution original - activeHighlights contains BOTH halves
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in markup mode with cursor at 0:10
    Then activeHighlights count is 2
    And activeHighlights has range 0:9 to 0:12
    And activeHighlights has range 0:14 to 0:17

  Scenario: Cursor in substitution modified - activeHighlights contains BOTH halves
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in markup mode with cursor at 0:15
    Then activeHighlights count is 2
    And activeHighlights has range 0:9 to 0:12
    And activeHighlights has range 0:14 to 0:17

  Scenario: Two changes, cursor in second - only second has activeHighlight
    Given markup text "{++add++} {--del--}"
    When I decorate in markup mode with cursor at 0:14
    Then activeHighlights count is 1
    And activeHighlights has range 0:10 to 0:19
