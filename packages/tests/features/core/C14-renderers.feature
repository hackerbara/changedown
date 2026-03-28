@core @renderers
Feature: Renderers
  CriticMarkup content is rendered through several views:
    - ANSI smart view: delimiters hidden, content colored, metadata projected, footnotes elided
    - ANSI markup view: full delimiters with colors
    - ANSI settled view: clean text, all changes applied
    - Meta view: three-zone format (margin, content, metadata), deliberation header

  # ── ANSI smart view (default) ─────────────────────────────────────

  Scenario: Smart view renders plain text unchanged
    Given a CriticMarkup text "Hello world."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output is "Hello world."

  Scenario: Smart view colors insertion green and hides delimiters
    Given a CriticMarkup text "Hello {++world++}."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output is "Hello world."
    And the raw ANSI output contains green escape code

  Scenario: Smart view colors deletion red with strikethrough
    Given a CriticMarkup text "Hello {--world--}."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output is "Hello world."
    And the raw ANSI output contains red escape code
    And the raw ANSI output contains strikethrough escape code

  Scenario: Smart view renders substitution as red-old arrow green-new
    Given a CriticMarkup text "Hello {~~world~>earth~~}."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output contains "world"
    And the stripped ANSI output contains "earth"
    And the raw ANSI output contains red escape code
    And the raw ANSI output contains green escape code

  Scenario: Smart view renders highlight with yellow background
    Given a CriticMarkup text "Hello {==world==}."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output is "Hello world."
    And the raw ANSI output contains yellow background escape code

  Scenario: Smart view renders comments as dim italic text
    Given a CriticMarkup text "Hello{>>a note<<}."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output contains "a note"
    And the raw ANSI output contains dim escape code

  Scenario: Smart view strips footnote refs with known footnotes
    Given a CriticMarkup text:
      """
      Hello[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output does not contain "[^cn-1]"
    And the stripped ANSI output contains "Hello"

  Scenario: Smart view strips trailing footnote ref on change
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output does not contain "[^cn-1]"
    And the stripped ANSI output contains "world"

  Scenario: Smart view omits footnote section
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output does not contain "[^cn-1]:"

  # ── ANSI smart view: metadata projection ──────────────────────────

  Scenario: Smart view projects metadata annotation at end of line
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:claude-opus-4.6 | 2026-02-25 | ins | proposed
        reason: spelling fix
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output contains "proposed"
    And the stripped ANSI output contains "@ai:claude-opus-4.6"
    And the stripped ANSI output contains "spelling fix"

  Scenario: Smart view shows deliberation header with status counts
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:claude-opus-4.6 | 2026-02-25 | ins | proposed
        reason: spelling fix
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output contains "1 proposed"
    And the stripped ANSI output contains "authors:"

  Scenario: Smart view header shows multiple statuses when mixed
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1] {--old--}[^cn-2].

      [^cn-1]: @alice | 2026-02-25 | ins | proposed
      [^cn-2]: @bob | 2026-02-25 | del | accepted
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output contains "1 proposed"
    And the stripped ANSI output contains "1 accepted"

  Scenario: Smart view shows reply count in metadata annotation
    Given a CriticMarkup text:
      """
      Hello {~~old~>new~~}[^cn-1].

      [^cn-1]: @alice | 2026-02-25 | sub | proposed
        reason: better wording
        @bob 2026-02-25: I agree with this change
        @alice 2026-02-25: thanks!
      """
    When I render with ANSI in "smart" view
    Then the stripped ANSI output contains "2 replies"

  Scenario: Smart view produces no header for plain text
    Given a CriticMarkup text "Just plain text."
    When I render with ANSI in "smart" view
    Then the stripped ANSI output is "Just plain text."

  # ── ANSI markup view ──────────────────────────────────────────────

  Scenario: Markup view shows full delimiters
    Given a CriticMarkup text "Hello {++world++}."
    When I render with ANSI in "markup" view
    Then the stripped ANSI output is "Hello {++world++}."

  Scenario: Markup view projects footnote metadata into Zone 3
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
      """
    When I render with ANSI in "markup" view
    Then the stripped ANSI output contains "cn-1"
    And the stripped ANSI output contains "@ai:test"

  Scenario: Markup view colorizes footnote definitions by status
    Given a CriticMarkup text:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @alice | 2026-02-25 | ins | proposed
      """
    When I render with ANSI in "markup" view
    Then the raw ANSI output contains yellow escape code

  # ── ANSI settled view ─────────────────────────────────────────────

  Scenario: Settled view produces clean text with all changes applied
    Given a CriticMarkup text "Hello {++world++} {--old--} {~~before~>after~~}."
    When I render with ANSI in "settled" view
    Then the stripped ANSI output is "Hello world  after."

  # ── ANSI Unicode strikethrough fallback ───────────────────────────

  Scenario: Unicode strikethrough applies combining overlay per character
    Given a CriticMarkup text "Hello {--world--}."
    When I render with ANSI using Unicode strikethrough
    Then the raw ANSI output contains Unicode combining strikethrough
    And the raw ANSI output contains red escape code
    And the raw ANSI output does not contain ANSI strikethrough escape code

  Scenario: Unicode strikethrough applies to old text in substitutions
    Given a CriticMarkup text "Hello {~~old~>new~~}."
    When I render with ANSI using Unicode strikethrough
    Then the raw ANSI output contains Unicode combining strikethrough for "old"
    And the raw ANSI output does not contain Unicode combining strikethrough for "new"

  # ── Meta view (three-zone format) ─────────────────────────────────

  Scenario: Meta view produces deliberation header
    Given a tracked markdown file "test.md" with content:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
      """
    When I render meta view for "test.md"
    Then the meta output contains "proposed: 1"
    And the meta output contains "test.md"

  Scenario: Meta view includes inline comment annotation for changes
    Given a tracked markdown file "test.md" with content:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
      """
    When I render meta view for "test.md"
    Then the meta output contains "{>>cn-1"
    And the meta output does not contain "[^cn-1]:"

  Scenario: Meta view appends Zone 3 metadata at end of line
    Given a tracked markdown file "test.md" with content:
      """
      Hello {++world++}[^cn-1].

      [^cn-1]: @ai:test | 2026-02-25 | ins | proposed
        reason: clarity
      """
    When I render meta view for "test.md"
    Then the meta output contains "{>>cn-1 @ai:test: clarity<<}"
