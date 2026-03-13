@fast @D3
Feature: D3 -- Decoration rendering in all-markup mode
  Tests that EditorDecorator applies correct decoration ranges when
  showMarkup=true (all-markup view). Covers all 5 change types, multi-line,
  empty content, mixed types, special characters, stress tests, decoration
  style modes (foreground vs background), character-level sidecar decorations,
  final view mode, and original view mode.

  # ── Mocha source: EditorDecorator.test.ts > Markup Mode (showMarkup=true) ──

  Scenario: Insertion highlights full range including delimiters
    Given markup text "Hello {++world++} end"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Deletion highlights full range including delimiters
    Given markup text "Hello {--world--} end"
    When I decorate in markup mode
    Then deletions count is 1
    And deletions has range 0:6 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Substitution highlights original and modified ranges separately
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in markup mode
    Then substitutionOriginals count is 1
    And substitutionModifieds count is 1
    And substitutionOriginals has range 0:9 to 0:12
    And substitutionModifieds has range 0:14 to 0:17
    And hiddens is empty
    And unfolded is empty

  Scenario: Highlight without comment highlights full range
    Given markup text "Hello {==important==} end"
    When I decorate in markup mode
    Then highlights count is 1
    And highlights has range 0:6 to 0:21
    And hiddens is empty

  Scenario: Highlight with comment highlights full range and has hover message
    Given markup text "Hello {==text==}{>>note<<} end"
    When I decorate in markup mode
    Then highlights count is 1
    And highlights has range 0:6 to 0:26
    And highlights at index 0 has hover containing "note"

  Scenario: Standalone comment shows full range with hover message
    Given markup text "Hello{>>feedback<<} end"
    When I decorate in markup mode
    Then comments count is 1
    And comments has range 0:5 to 0:19
    And comments at index 0 has hover containing "feedback"

  Scenario: Multiple types together - insertion and deletion each decorated
    Given markup text "{++add++} mid {--del--}"
    When I decorate in markup mode
    Then insertions count is 1
    And deletions count is 1
    And insertions has range 0:0 to 0:9
    And deletions has range 0:14 to 0:23

  Scenario: Empty content insertion decorates full delimiter range
    Given markup text "{++++}"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:0 to 0:6

  Scenario: Multi-line insertion spans across lines
    Given markup text:
      """
      Start
      {++line one
      line two++}
      End
      """
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 1:0 to 2:11

  # ── Mocha source: Special Characters and Stress Tests ──

  Scenario: Unicode/emoji in insertion content
    Given markup text "Text {++hello \ud83c\udf89 world++} end"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2

  Scenario: Special characters in insertion (HTML-like content)
    Given markup text "{++<script>alert(\"xss\")</script>++}"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2

  Scenario: Markup inside markdown bold
    Given markup text "**bold {++addition++}**"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:7 to 0:10
    And hiddens has range 0:18 to 0:21

  Scenario: Three adjacent insertions
    Given markup text "{++a++}{++b++}{++c++}"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 6
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:4 to 0:7
    And hiddens has range 0:7 to 0:10
    And hiddens has range 0:11 to 0:14
    And hiddens has range 0:14 to 0:17
    And hiddens has range 0:18 to 0:21

  Scenario: All five types on one line
    Given markup text "{++add++}{--del--}{~~old~>new~~}{==hi==}{>>note<<}"
    When I decorate in smart view mode
    Then insertions is empty
    And deletions is empty
    And substitutionOriginals is empty
    And substitutionModifieds is empty
    And highlights count is 1
    And commentIcons count is 1

  Scenario: Stress test - 50 insertions across 50 lines
    Given markup text:
      """
      {++change 0++}
      {++change 1++}
      {++change 2++}
      {++change 3++}
      {++change 4++}
      {++change 5++}
      {++change 6++}
      {++change 7++}
      {++change 8++}
      {++change 9++}
      {++change 10++}
      {++change 11++}
      {++change 12++}
      {++change 13++}
      {++change 14++}
      {++change 15++}
      {++change 16++}
      {++change 17++}
      {++change 18++}
      {++change 19++}
      {++change 20++}
      {++change 21++}
      {++change 22++}
      {++change 23++}
      {++change 24++}
      {++change 25++}
      {++change 26++}
      {++change 27++}
      {++change 28++}
      {++change 29++}
      {++change 30++}
      {++change 31++}
      {++change 32++}
      {++change 33++}
      {++change 34++}
      {++change 35++}
      {++change 36++}
      {++change 37++}
      {++change 38++}
      {++change 39++}
      {++change 40++}
      {++change 41++}
      {++change 42++}
      {++change 43++}
      {++change 44++}
      {++change 45++}
      {++change 46++}
      {++change 47++}
      {++change 48++}
      {++change 49++}
      """
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 100

  Scenario: No markup - all decoration arrays empty
    Given markup text:
      """
      Just plain text
      with no markup
      at all.
      """
    When I decorate in smart view mode
    Then insertions is empty
    And deletions is empty
    And substitutionOriginals is empty
    And substitutionModifieds is empty
    And highlights is empty
    And comments is empty
    And hiddens is empty
    And unfolded is empty
    And commentIcons is empty

  Scenario: Malformed markup (unclosed) produces no decorations
    Given markup text "Text {++unclosed without closing"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens is empty

  Scenario: Comment with markdown in hover text
    Given markup text "{>>Comment with **bold** and `code`<<}"
    When I decorate in smart view mode
    Then commentIcons count is 1
    And commentIcons at index 0 has hover containing "**bold**"
    And commentIcons at index 0 has hover containing "`code`"

  # ── Mocha source: Character-Level Decoration for Sidecar Substitutions ──

  Scenario: Sidecar single-line substitution highlights changed characters
    Given markup text "Hi, World!"
    And a sidecar substitution with original "Hello, World!" modified "Hi, World!" at offset 0
    When I decorate the manual changes in markup mode
    Then substitutionModifieds count is 1

  Scenario: Sidecar substitution - no character highlighting if originalText missing
    Given markup text "Hi, World!"
    And a sidecar substitution with only modifiedText "Hi, World!" at offset 0 to 10
    When I decorate the manual changes in markup mode
    Then substitutionModifieds count is 1

  Scenario: Sidecar substitution - no character highlighting if modifiedText missing
    Given markup text "Hello, World!"
    And a sidecar substitution with only originalText "Hello, World!" at offset 0 to 13
    When I decorate the manual changes in markup mode
    Then substitutionOriginals count is 1

  Scenario: Sidecar multi-line substitution skips character-level highlighting
    Given markup text:
      """
      Hi,
      World!
      """
    And a sidecar substitution with original "Hello,\nWorld!" modified "Hi,\nWorld!" at offset 0
    When I decorate the manual changes in markup mode
    Then substitutionModifieds count is 1

  Scenario: Sidecar insertion without originalText - no character-level highlighting
    Given markup text "New line!"
    And a sidecar insertion with modifiedText "New line!" at offset 0 to 9
    When I decorate the manual changes in markup mode
    Then insertions count is 1

  Scenario: Sidecar deletion without modifiedText - no character-level highlighting
    Given markup text "# - Old line"
    And a sidecar deletion with originalText "Old line" at offset 0 to 12
    When I decorate the manual changes in markup mode
    Then deletions count is 1

  # ── Mocha source: Decoration Style Modes ──

  Scenario: Foreground mode insertion decorated correctly
    Given decorator style "foreground"
    And markup text "Hello {++world++} end"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:6 to 0:17

  Scenario: Foreground mode deletion decorated correctly
    Given decorator style "foreground"
    And markup text "Hello {--removed--} end"
    When I decorate in markup mode
    Then deletions count is 1
    And deletions has range 0:6 to 0:19

  Scenario: Foreground mode substitution decorated correctly
    Given decorator style "foreground"
    And markup text "Hello {~~old~>new~~} end"
    When I decorate in markup mode
    Then substitutionModifieds count is 1
    And substitutionModifieds has range 0:14 to 0:17
    And substitutionOriginals count is 1
    And substitutionOriginals has range 0:9 to 0:12

  Scenario: Background mode insertion has background tinting
    Given decorator style "background"
    And markup text "Hello {++world++} end"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:6 to 0:17

  Scenario: Default decorator style defaults to foreground
    Given markup text "Hello {++world++} end"
    When I decorate in markup mode
    Then insertions count is 1
    And insertions has range 0:6 to 0:17

  # ── Mocha source: Final View Mode (viewMode=final) ──

  Scenario: Final mode - insertion hides delimiters, shows content
    Given markup text "Hello {++world++} end"
    When I decorate in final mode
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And insertions is empty

  Scenario: Final mode - deletion hides everything
    Given markup text "Hello {--world--} end"
    When I decorate in final mode
    Then hiddens count is 1
    And hiddens has range 0:6 to 0:17
    And deletions is empty

  Scenario: Final mode - substitution hides old text and delimiters, shows new
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in final mode
    Then hiddens count is 3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:9 to 0:14
    And hiddens has range 0:17 to 0:20
    And substitutionOriginals is empty
    And substitutionModifieds is empty

  Scenario: Final mode - highlight hides delimiters, shows content
    Given markup text "Hello {==important==} end"
    When I decorate in final mode
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:18 to 0:21
    And highlights is empty

  Scenario: Final mode - highlight with comment hides delimiters and comment
    Given markup text "Hello {==text==}{>>note<<} end"
    When I decorate in final mode
    Then hiddens count is 3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:13 to 0:16
    And hiddens has range 0:16 to 0:26
    And highlights is empty
    And commentIcons is empty

  Scenario: Final mode - standalone comment hides everything
    Given markup text "Hello{>>feedback<<} end"
    When I decorate in final mode
    Then hiddens count is 1
    And hiddens has range 0:5 to 0:19
    And comments is empty
    And commentIcons is empty

  Scenario: Final mode - all five types only insertions and highlights show content
    Given markup text "{++add++}{--del--}{~~old~>new~~}{==hi==}{>>note<<}"
    When I decorate in final mode
    Then insertions is empty
    And deletions is empty
    And substitutionOriginals is empty
    And substitutionModifieds is empty
    And highlights is empty
    And comments is empty
    And hiddens length is greater than 0

  Scenario: Final mode - no active highlights (early return)
    Given markup text "Hello {++world++} end"
    When I decorate in final mode with cursor at 0:10
    Then activeHighlights is empty

  Scenario: Final mode - empty insertion both delimiters hidden
    Given markup text "{++++}"
    When I decorate in final mode
    Then hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:3 to 0:6

  # ── Mocha source: Original View Mode (viewMode=original) ──

  Scenario: Original mode - insertion hides everything
    Given markup text "Hello {++world++} end"
    When I decorate in original mode
    Then hiddens count is 1
    And hiddens has range 0:6 to 0:17
    And insertions is empty

  Scenario: Original mode - deletion hides delimiters, shows content
    Given markup text "Hello {--world--} end"
    When I decorate in original mode
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17
    And deletions is empty

  Scenario: Original mode - substitution shows old text, hides separator + new + delimiters
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in original mode
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:12 to 0:20
    And substitutionOriginals is empty
    And substitutionModifieds is empty

  Scenario: Original mode - highlight hides delimiters, shows content
    Given markup text "Hello {==important==} end"
    When I decorate in original mode
    Then hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:18 to 0:21
    And highlights is empty

  Scenario: Original mode - highlight with comment hides delimiters and comment
    Given markup text "Hello {==text==}{>>note<<} end"
    When I decorate in original mode
    Then hiddens count is 3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:13 to 0:16
    And hiddens has range 0:16 to 0:26
    And highlights is empty
    And commentIcons is empty

  Scenario: Original mode - standalone comment hides everything
    Given markup text "Hello{>>feedback<<} end"
    When I decorate in original mode
    Then hiddens count is 1
    And hiddens has range 0:5 to 0:19
    And comments is empty
    And commentIcons is empty

  Scenario: Original mode - all five types only deletions and highlights show content
    Given markup text "{++add++}{--del--}{~~old~>new~~}{==hi==}{>>note<<}"
    When I decorate in original mode
    Then insertions is empty
    And deletions is empty
    And substitutionOriginals is empty
    And substitutionModifieds is empty
    And highlights is empty
    And comments is empty
    And hiddens length is greater than 0

  Scenario: Original mode - no active highlights (early return)
    Given markup text "Hello {++world++} end"
    When I decorate in original mode with cursor at 0:10
    Then activeHighlights is empty

  Scenario: Original mode - empty deletion both delimiters hidden
    Given markup text "{----}"
    When I decorate in original mode
    Then hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:3 to 0:6

  Scenario: Final vs original - insertion visible in final, hidden in original
    Given markup text "Hello {++world++} end"
    When I decorate in final mode
    # Final: insertion content visible (2 hidden = delimiters only)
    Then hiddens count is 2

  Scenario: Final vs original - deletion hidden in final, visible in original
    Given markup text "Hello {--world--} end"
    When I decorate in original mode
    # Original: deletion content visible (2 hidden = delimiters only)
    Then hiddens count is 2

  # ── Mocha source: Highlight with footnote author color ──

  Scenario: Highlight+comment+footnote from full parser pipeline produces Highlight type
    Given markup text:
      """
      {==highlighted text==}{>>a comment<<}[^ct-1]
      {++inserted text++}[^ct-2]

      [^ct-1]: @alice | 2026-02-20 | highlight | proposed
      [^ct-2]: @bob | 2026-02-20 | ins | proposed
      """
    When I decorate in markup mode
    Then the parser finds 2 changes in the decoration text
    And parsed change 1 is type Highlight
    And parsed change 1 has author "@alice"
    And parsed change 1 has metadata comment "a comment"
    And parsed change 2 is type Insertion
    And parsed change 2 has author "@bob"

  Scenario: Highlight with author uses default highlight type, even with multi-author coloring
    Given markup text:
      """
      {==highlighted text==}{>>a comment<<}[^ct-1]
      {++inserted text++}[^ct-2]

      [^ct-1]: @alice | 2026-02-20 | highlight | proposed
      [^ct-2]: @bob | 2026-02-20 | ins | proposed
      """
    When I decorate in markup mode
    # Highlight uses default highlights array (yellow background)
    Then highlights count is 1
    # Insertion routed to author type (2 authors -> auto activates)
    And insertions is empty
    # 14 base types + 1 author type (for insertion only, not highlight)
    And total setDecorations calls is 15
