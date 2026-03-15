@fast @D9
Feature: D9 -- Show Delimiters behavior matrix
  The showDelimiters setting controls delimiter and footnote reference visibility
  with view-mode-specific behavior:

  - Review + Delimiters OFF (default): Type decorations on contentRange, delimiters hidden, NO cursor unfolding
  - Review + Delimiters ON: Full static markup (delimiters + refs visible), no cursor tricks
  - Simple + Delimiters OFF: Clean text, delimiters always hidden, NO cursor unfolding
  - Simple + Delimiters ON: Delimiters hidden, but cursor entering CONTENT range reveals them

  The trigger zone for cursor unfolding uses contentRange (not fullRange), so
  cursor on delimiter characters does NOT trigger unfolding.

  # ── Review + Delimiters OFF: type decorations always applied, no unfolding ──

  Scenario: Review + Delimiters OFF + cursor in content: delimiters stay hidden
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters off and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Review + Delimiters OFF + no cursor: type decorations still applied
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters off
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Review + Delimiters OFF + deletion + no cursor: type decorations still applied
    Given markup text "Hello {--world--} end"
    When I decorate in review mode with showDelimiters off
    Then deletions count is 1
    And deletions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Review + Delimiters OFF + deletion + cursor in content: delimiters stay hidden
    Given markup text "Hello {--world--} end"
    When I decorate in review mode with showDelimiters off and cursor at 0:10
    Then deletions count is 1
    And deletions has range 0:9 to 0:14
    And hiddens count is 2
    And unfolded is empty

  # ── Review + Delimiters ON: full static markup, no cursor tricks ──

  Scenario: Review + Delimiters ON: insertion shows full range including delimiters
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters on
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Review + Delimiters ON + cursor in content: still static, no unfolding
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters on and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Review + Delimiters ON: substitution shows full range
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in review mode with showDelimiters on
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And hiddens is empty
    And unfolded is empty

  # ── Simple + Delimiters OFF: always hidden, no cursor unfolding ──

  Scenario: Simple + Delimiters OFF + no cursor: settled-base (cursor far away)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Simple + Delimiters OFF + cursor in content: delimiters STAY hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Simple + Delimiters OFF + cursor on delimiter: delimiters stay hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:6
    Then hiddens count is 2
    And unfolded is empty

  # ── Simple + Delimiters ON: cursor-in-content reveals delimiters ──

  Scenario: Simple + Delimiters ON + cursor in content: delimiters unfold
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And unfolded count is 2
    And unfolded has range 0:6 to 0:9
    And unfolded has range 0:14 to 0:17
    And hiddens is empty

  Scenario: Simple + Delimiters ON + cursor outside change: delimiters hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:0
    Then insertions count is 1
    And hiddens count is 2
    And unfolded is empty

  Scenario: Simple + Delimiters ON + cursor on opening delimiter: NO unfold (contentRange trigger)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:6
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Simple + Delimiters ON + cursor on closing delimiter: NO unfold (contentRange trigger)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:17
    Then hiddens count is 2
    And unfolded is empty

  Scenario: Simple + Delimiters ON + cursor at first content char: unfolds
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:9
    Then unfolded count is 2
    And unfolded has range 0:6 to 0:9
    And unfolded has range 0:14 to 0:17
    And hiddens is empty

  Scenario: Simple + Delimiters ON + cursor at last content char: unfolds
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:14
    Then unfolded count is 2
    And hiddens is empty

  Scenario: Simple + Delimiters ON + substitution cursor in original: unfolds all three parts
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:10
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And unfolded count is 3
    And unfolded has range 0:6 to 0:9
    And unfolded has range 0:12 to 0:14
    And unfolded has range 0:17 to 0:20
    And hiddens is empty

  Scenario: Simple + Delimiters ON + deletion cursor in content: unfolds
    Given markup text "Hello {--removed--} end"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:12
    Then deletions count is 1
    And unfolded count is 2
    And hiddens is empty

  # ── Two changes: only the one with cursor unfolds ──

  Scenario: Simple + Delimiters ON + two changes, cursor in second: first hidden, second unfolded
    Given markup text "{++add++} {--del--}"
    When I decorate in smart view mode with showDelimiters on and cursor at 0:14
    Then insertions count is 1
    And deletions count is 1
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:6 to 0:9
    And unfolded count is 2
    And unfolded has range 0:10 to 0:13
    And unfolded has range 0:16 to 0:19

  # ── Boundary: activeHighlights use contentRange, not fullRange ──

  Scenario: Review + Delimiters ON + cursor on opening delimiter: no activeHighlight
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters on and cursor at 0:6
    Then activeHighlights is empty

  Scenario: Review + Delimiters ON + cursor on closing delimiter: no activeHighlight
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters on and cursor at 0:15
    Then activeHighlights is empty

  # ── Settled/Raw modes: showDelimiters has no effect ──

  Scenario: Final mode ignores showDelimiters ON
    Given markup text "Hello {++world++} end"
    When I decorate in final mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 2
    And unfolded is empty

  Scenario: Original mode ignores showDelimiters ON
    Given markup text "Hello {++world++} end"
    When I decorate in original mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 1
    And unfolded is empty
