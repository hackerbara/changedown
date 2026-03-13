Feature: Read tracked file views
  As an AI agent
  I want to read files in different view modes
  So I can choose the right perspective for my task

  Background:
    Given a tracked file "doc.md" with 1 accepted substitution alpha to ALPHA and 1 pending substitution gamma to GAMMA

  Scenario: Meta view projects deliberation inline
    When I call read_tracked_file with view = "meta"
    Then the output contains inline annotations like "[ct-1 accepted @ai:test-agent: capitalize]"
    And the footnote section is elided
    And a deliberation summary header appears at the top
    And the header contains proposed and accepted counts

  Scenario: Content view shows raw CriticMarkup
    When I call read_tracked_file with view = "content"
    Then the output contains literal CriticMarkup delimiters ({~~ and ~> and ~~})
    And footnote definitions ARE included (content = full raw file)
    And LINE:HASH coordinates appear on each line

  Scenario: Full view shows everything
    When I call read_tracked_file with view = "full"
    Then the output contains both inline CriticMarkup and full footnotes
    And the output format is identical to content view

  Scenario: Settled view shows accepted-applied, pending-reverted text
    When I call read_tracked_file with view = "settled"
    Then the output shows "ALPHA" (accepted substitution applied)
    And "gamma" does NOT appear (replaced by ALPHA... wait, gamma is a different change)
    And "gamma" appears (pending substitution reverted to original)
    And no CriticMarkup delimiters appear in the content lines
    And footnote definitions are stripped

  Scenario: Committed view shows accepted-applied, pending-reverted with flags
    When I call read_tracked_file with view = "committed"
    Then accepted changes show their new text ("ALPHA")
    And pending changes show original text ("gamma", not "GAMMA")
    And A flag marks lines with accepted changes
    And P flag marks lines with pending changes
    And a change summary appears in the header (e.g. "1P 1A")

  Scenario: Line range slicing with offset/limit
    When I call read_tracked_file with offset = 1, limit = 1
    Then only 1 line is returned in the content
    And hashline coordinates are present

  Scenario: include_meta flag adds change levels line
    When I call read_tracked_file with include_meta = true, view = "content"
    Then the header includes a "## change levels:" line
