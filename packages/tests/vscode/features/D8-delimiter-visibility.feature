@fast @D8
Feature: D8 -- Delimiter visibility independent of view mode
  The showDelimiters setting controls whether CriticMarkup delimiters
  are visible, independent of the view mode. When false, delimiters
  are hidden and content is decorated with semantic styling only.
  Cursor-aware unfolding only activates when showDelimiters=true in
  changes/simple mode — it does not activate in review or settled modes.

  # ── Review mode + showDelimiters=false (NEW: delimiters hidden in review) ──

  Scenario: Review + showDelimiters=false: insertion settled-base (cursor far away)
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters off
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17

  Scenario: Review + showDelimiters=false: deletion settled-base (cursor far away)
    Given markup text "Hello {--world--} end"
    When I decorate in review mode with showDelimiters off
    Then deletions is empty
    And hiddens count is 1
    And hiddens has range 0:6 to 0:17

  Scenario: Review + showDelimiters=false: substitution settled-base (cursor far away)
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in review mode with showDelimiters off
    Then substitutionOriginals is empty
    And substitutionModifieds is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:14
    And hiddens has range 0:17 to 0:20

  Scenario: Review + showDelimiters=false: cursor-in-change does NOT unfold (review mode)
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters off and cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And unfolded is empty

  # ── Review mode + showDelimiters=true (existing behavior preserved) ──

  Scenario: Review + showDelimiters=true: insertion decorates full range with delimiters
    Given markup text "Hello {++world++} end"
    When I decorate in review mode with showDelimiters on
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty

  Scenario: Review + showDelimiters=true: deletion decorates full range
    Given markup text "Hello {--world--} end"
    When I decorate in review mode with showDelimiters on
    Then deletions count is 1
    And deletions has range 0:6 to 0:17
    And hiddens is empty

  # ── Changes (smart view) mode + showDelimiters=true (NEW: delimiters shown) ──

  Scenario: Changes + showDelimiters=true: settled-base when cursor far away
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17

  # ── Settled/Raw modes: showDelimiters has no effect ──

  Scenario: Final mode ignores showDelimiters=true — still hides all markup
    Given markup text "Hello {++world++} end"
    When I decorate in final mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17

  Scenario: Original mode ignores showDelimiters=true — still hides insertions
    Given markup text "Hello {++world++} end"
    When I decorate in original mode with showDelimiters on
    Then insertions is empty
    And hiddens count is 1
    And hiddens has range 0:6 to 0:17
