@fast @agent-content @VA2
Feature: Agent Content Decorations - Footnoted Changes
  EditorDecorator correctly renders agent-created CriticMarkup that
  includes footnote references [^cn-N]. The parser extends node.range
  to include the trailing footnote reference while contentRange stays
  unchanged. The decorator splits the footnote reference portion into
  settledRefs (gray metadata styling), so type-colored decorations
  cover only the CriticMarkup content. This affects markup mode ranges,
  smart view hiding, and cursor-aware unfolding.

  # ─── Markup Mode with Footnotes ──────────────────────────────────

  Scenario: Agent insertion fullRange includes footnote ref
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Footnote ref is NOT decorated as a separate change
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in markup mode
    Then the parser finds 1 change in the decoration text
    And parsed change 1 is type Insertion

  Scenario: Agent deletion fullRange includes footnote ref
    Given markup text "{--removed--}[^cn-1] rest"
    When I decorate in markup mode
    Then deletions count is 1
    And deletions has range 0:0 to 0:13

  # ─── Substitution with Footnotes ─────────────────────────────────

  Scenario: Agent substitution original and modified ranges
    Given markup text "{~~old~>new~~}[^cn-2] rest"
    When I decorate in markup mode
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And substitutionOriginals has range 0:0 to 0:8
    And substitutionModifieds has range 0:8 to 0:14
    And hiddens is empty

  Scenario: Substitution footnote ref does not affect sub-ranges
    Given the input text is:
      """
      {~~old~>new~~}[^cn-2] rest
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a substitution
    And change 1 original range starts at 3
    And change 1 original range ends at 6
    And change 1 modified range starts at 8
    And change 1 modified range ends at 11
    And change 1 range ends at 21

  # ─── Smart View Hides Delimiters and Footnote References ─────────

  Scenario: Smart view settled-base: insertion plain, delimiters+footnote hidden (cursor far away)
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24

  Scenario: Smart view settled-base: deletion entirely hidden (cursor far away)
    Given markup text "{--removed--}[^cn-1] rest"
    When I decorate in smart view mode
    Then deletions is empty
    And hiddens count is 1
    And hiddens has range 0:0 to 0:20

  # ─── Smart View Substitution with Footnote ───────────────────────

  Scenario: Smart view settled-base: substitution new text as plain (cursor far away)
    Given markup text "The {~~old~>new~~}[^cn-1] method"
    When I decorate in smart view mode
    Then substitutionOriginals is empty
    And substitutionModifieds is empty
    And hiddens count is 2
    And hiddens has range 0:4 to 0:12
    And hiddens has range 0:15 to 0:25

  # ─── Author Color Attribution with Footnotes ─────────────────────

  Scenario: Two agent authors trigger per-author coloring
    Given markup text:
      """
      {++added by claude++}[^cn-1] middle {++added by alice++}[^cn-2]

      [^cn-1]: @ai:claude | 2026-02-20 | ins | proposed
      [^cn-2]: @alice | 2026-02-20 | ins | proposed
      """
    When I decorate in markup mode
    Then the parser finds 2 changes in the decoration text
    And parsed change 1 has author "@ai:claude"
    And parsed change 2 has author "@alice"
    And insertions is empty
    And total setDecorations calls is 24

  Scenario: Single agent author uses semantic colors
    Given markup text:
      """
      {++added text++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-20 | ins | proposed
      """
    When I decorate in markup mode
    Then insertions count is 1
    And total setDecorations calls is 22

  # ─── Cursor-Aware Unfolding with Footnotes ───────────────────────

  Scenario: Cursor inside footnoted insertion unfolds delimiters
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in smart view mode with cursor at 0:10
    Then insertions count is 1
    And insertions has range 0:9 to 0:14
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24
    And unfolded is empty

  Scenario: Cursor at opening delimiter unfolds
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in smart view mode with cursor at 0:6
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24
    And unfolded is empty

  Scenario: Cursor at end of footnote ref unfolds
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in smart view mode with cursor at 0:24
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24
    And unfolded is empty

  Scenario: Cursor inside footnoted substitution unfolds all 3 parts
    Given markup text "The {~~old~>new~~}[^cn-1] method"
    When I decorate in smart view mode with cursor at 0:8
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And substitutionOriginals has range 0:7 to 0:10
    And substitutionModifieds has range 0:12 to 0:15
    And hiddens count is 3
    And hiddens has range 0:4 to 0:7
    And hiddens has range 0:10 to 0:12
    And hiddens has range 0:15 to 0:25
    And unfolded is empty

  # ─── Cursor Outside Footnoted Change ─────────────────────────────

  Scenario: Cursor at start of line hides delimiters and footnote
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in smart view mode with cursor at 0:0
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24
    And unfolded is empty

  Scenario: Cursor one char past footnote ref hides delimiters
    Given markup text "Hello {++world++}[^cn-1] end"
    When I decorate in smart view mode with cursor at 0:25
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24
    And unfolded is empty

  Scenario: Cursor on different line hides footnoted change
    Given markup text:
      """
      Hello {++world++}[^cn-1] end
      Second line
      """
    When I decorate in smart view mode with cursor at 1:0
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:24
    And unfolded is empty

  # ─── Multiple Agent Changes with Footnotes ───────────────────────

  Scenario: Three change types with footnotes all decorated correctly
    Given markup text:
      """
      {++added++}[^cn-1] text
      {--removed--}[^cn-2] more
      {~~old~>new~~}[^cn-3] end
      """
    When I decorate in markup mode
    Then insertions count is 1
    And deletions count is 1
    And substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And insertions has range 0:0 to 0:11
    And deletions has range 1:0 to 1:13
    And substitutionOriginals has range 2:0 to 2:8
    And substitutionModifieds has range 2:8 to 2:14

  Scenario: Multiple footnoted changes settled-base: insertion plain, deletion hidden
    Given markup text:
      """
      {++added++}[^cn-1] text
      {--removed--}[^cn-2] more
      """
    When I decorate in smart view mode
    Then insertions is empty
    And deletions is empty
    And hiddens count is 3
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:8 to 0:18
    And hiddens has range 1:0 to 1:20

  Scenario: Agent changes with footnote definitions parsed and decorated
    Given markup text:
      """
      Intro {++added++}[^cn-1] middle {--removed--}[^cn-2] end

      [^cn-1]: @ai:claude | 2026-02-20 | ins | proposed
      [^cn-2]: @ai:claude | 2026-02-20 | del | proposed
      """
    When I decorate in markup mode
    Then the parser finds 2 changes in the decoration text
    And parsed change 1 has author "@ai:claude"
    And parsed change 2 has author "@ai:claude"
    And insertions count is 1
    And deletions count is 1

  # ─── Edge Cases ──────────────────────────────────────────────────

  Scenario: Dotted footnote ID handled correctly
    Given markup text "{++moved text++}[^cn-1.1] rest"
    When I decorate in markup mode
    Then the parser finds 1 change in the decoration text

  Scenario: Footnoted change with no definition still decorated
    Given markup text "{++orphan++}[^cn-99] end"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:0 to 0:12

  Scenario: Two footnoted changes on same line each get correct ranges
    Given markup text "{++a++}[^cn-1] {++b++}[^cn-2]"
    When I decorate in markup mode
    Then insertions count is 2
    And insertions has range 0:0 to 0:7
    And insertions has range 0:15 to 0:22

  Scenario: Two footnoted insertions settled-base: plain text, all delimiters hidden
    Given markup text "{++a++}[^cn-1] {++b++}[^cn-2]"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 4
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:4 to 0:14
    And hiddens has range 0:15 to 0:18
    And hiddens has range 0:19 to 0:29

  Scenario: Highlight with comment and footnote ref extends range
    Given the input text is:
      """
      {==highlighted==}{>>comment<<}[^cn-1] end
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a highlight
    And change 1 has id "cn-1"
