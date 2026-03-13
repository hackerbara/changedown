@fast @D9
Feature: D9 -- Show CriticMarkup behavior matrix
  The showCriticMarkup setting (replacing showDelimiters) controls delimiter
  and footnote reference visibility with view-mode-specific behavior:

  - Review + CM OFF (default): Decorated text, no delimiters, NO cursor unfolding
  - Review + CM ON: Full static markup (delimiters + refs visible), no cursor tricks
  - Simple + CM OFF: Clean text, delimiters always hidden, NO cursor unfolding
  - Simple + CM ON: Delimiters hidden, but cursor entering CONTENT range reveals them

  The trigger zone for cursor unfolding uses contentRange (not fullRange), so
  cursor on delimiter characters does NOT trigger unfolding.

  # ── Review + CM OFF: no unfolding even with cursor in change ──

  Scenario: Review + CM OFF + cursor in content: delimiters stay hidden
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showCriticMarkup off and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Review + CM OFF + no cursor: settled-base (cursor far away)
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showCriticMarkup off
    Then insertions is empty
    And hiddens count is 2
    And unfolded is empty

  Scenario: Review + CM OFF + deletion + cursor in content: delimiters stay hidden
    Given markup text "Hello {--world--} end"
    When I decorate in review mode with showCriticMarkup off and cursor at 0:10
    Then deletions count is 1
    And deletions has range 0:9 to 0:14
    And hiddens count is 2
    And unfolded is empty

  # ── Review + CM ON: full static markup, no cursor tricks ──

  Scenario: Review + CM ON: insertion shows full range including delimiters
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showCriticMarkup on
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Review + CM ON + cursor in content: still static, no unfolding
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showCriticMarkup on and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Review + CM ON: substitution shows full range
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in review mode with showCriticMarkup on
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And hiddens is empty
    And unfolded is empty

  # ── Simple + CM OFF: always hidden, no cursor unfolding ──

  Scenario: Simple + CM OFF + no cursor: settled-base (cursor far away)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Simple + CM OFF + cursor in content: delimiters STAY hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Simple + CM OFF + cursor on delimiter: delimiters stay hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with cursor at 0:6
    Then hiddens count is 2
    And unfolded is empty

  # ── Simple + CM ON: cursor-in-content reveals delimiters ──

  Scenario: Simple + CM ON + cursor in content: delimiters unfold
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And unfolded count is 2
    And unfolded has range 0:6 to 0:9
    And unfolded has range 0:14 to 0:17
    And hiddens is empty

  Scenario: Simple + CM ON + cursor outside change: delimiters hidden
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:0
    Then insertions count is 1
    And hiddens count is 2
    And unfolded is empty

  Scenario: Simple + CM ON + cursor on opening delimiter: NO unfold (contentRange trigger)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:6
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  Scenario: Simple + CM ON + cursor on closing delimiter: NO unfold (contentRange trigger)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:17
    Then hiddens count is 2
    And unfolded is empty

  Scenario: Simple + CM ON + cursor at first content char: unfolds
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:9
    Then unfolded count is 2
    And unfolded has range 0:6 to 0:9
    And unfolded has range 0:14 to 0:17
    And hiddens is empty

  Scenario: Simple + CM ON + cursor at last content char: unfolds
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:14
    Then unfolded count is 2
    And hiddens is empty

  Scenario: Simple + CM ON + substitution cursor in original: unfolds all three parts
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:10
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And unfolded count is 3
    And unfolded has range 0:6 to 0:9
    And unfolded has range 0:12 to 0:14
    And unfolded has range 0:17 to 0:20
    And hiddens is empty

  Scenario: Simple + CM ON + deletion cursor in content: unfolds
    Given markup text "Hello {--removed--} end"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:12
    Then deletions count is 1
    And unfolded count is 2
    And hiddens is empty

  # ── Two changes: only the one with cursor unfolds ──

  Scenario: Simple + CM ON + two changes, cursor in second: first hidden, second unfolded
    Given markup text "{++add++} {--del--}"
    When I decorate in smart view mode with showCriticMarkup on and cursor at 0:14
    Then insertions count is 1
    And deletions count is 1
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:6 to 0:9
    And unfolded count is 2
    And unfolded has range 0:10 to 0:13
    And unfolded has range 0:16 to 0:19

  # ── Boundary: activeHighlights use contentRange, not fullRange ──

  Scenario: Review + CM ON + cursor on opening delimiter: no activeHighlight
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showCriticMarkup on and cursor at 0:6
    Then activeHighlights is empty

  Scenario: Review + CM ON + cursor on closing delimiter: no activeHighlight
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showCriticMarkup on and cursor at 0:15
    Then activeHighlights is empty

  # ── Settled/Raw modes: showCriticMarkup has no effect ──

  Scenario: Final mode ignores showCriticMarkup ON
    Given markup text "Hello {++world++} end"
    When I decorate in final mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 2
    And unfolded is empty

  Scenario: Original mode ignores showCriticMarkup ON
    Given markup text "Hello {++world++} end"
    When I decorate in original mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 1
    And unfolded is empty
