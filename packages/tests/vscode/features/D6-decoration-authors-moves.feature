@fast @D6
Feature: D6 -- Per-author coloring and move decorations
  Tests per-author coloring mechanics (auto/always/never modes, palette cycling,
  author routing for insertions, deletions, substitutions, highlights, comments),
  move-from/move-to purple decorations, move cursor unfolding, move active
  highlights, and authored move routing.

  # ── Mocha source: Per-Author Coloring ──

  Scenario: Change with no author uses default decoration type (backward compat)
    Given author colors mode "always"
    And markup text "Hello"
    And a change of type "insertion" with no author at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then insertions count is 1
    And total setDecorations calls is 22

  Scenario: Change with author produces additional setDecorations call
    Given author colors mode "always"
    And markup text "Hello"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 23

  Scenario: Two changes, same author same type grouped under one decoration type
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "alice" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 23
    And author decoration call 22 has 2 ranges

  Scenario: Two changes, different authors get different decoration types
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "bob" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 24

  Scenario: Authored deletion and insertion get separate decoration types
    Given author colors mode "always"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "deletion" by "alice" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And deletions is empty
    And total setDecorations calls is 24

  Scenario: 6 authors - colors cycle through palette
    Given author colors mode "always"
    And markup text "a b c d e f"
    And a change of type "insertion" by "author_a" at offset 0 to 1
    And a change of type "insertion" by "author_b" at offset 2 to 3
    And a change of type "insertion" by "author_c" at offset 4 to 5
    And a change of type "insertion" by "author_d" at offset 6 to 7
    And a change of type "insertion" by "author_e" at offset 8 to 9
    And a change of type "insertion" by "author_f" at offset 10 to 11
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 28

  Scenario: Authored substitution - original and modified get separate decoration types
    Given author colors mode "always"
    And markup text "Hello {~~old~>new~~} end"
    And a substitution by "alice" at offset 0 to 20 with originalRange 3-6 and modifiedRange 8-11
    When I decorate the manual changes in markup mode
    Then substitutionOriginals is empty
    And substitutionModifieds is empty
    And total setDecorations calls is 24

  Scenario: Authored change in smart view settled-base: no author decoration (cursor far away)
    Given author colors mode "always"
    And markup text "Hello world end"
    And a change of type "insertion" by "alice" at offset 6 to 11
    When I decorate the manual changes in smart view mode
    Then insertions is empty
    And total setDecorations calls is 22

  Scenario: Authored highlight always uses default highlight type, never author type
    Given author colors mode "always"
    And markup text "Highlighted"
    And a change of type "highlight" by "alice" at offset 0 to 10
    When I decorate the manual changes in markup mode
    Then highlights count is 1
    And total setDecorations calls is 22

  Scenario: Authored comment always uses default comment type, never author type
    Given author colors mode "always"
    And markup text "A comment!"
    And a change of type "comment" by "alice" at offset 0 to 10
    When I decorate the manual changes in markup mode
    Then comments count is 1
    And total setDecorations calls is 22

  # ── Mocha source: Author Colors Configuration (auto / always / never) ──

  Scenario: Auto mode - single author uses semantic colors
    Given author colors mode "auto"
    And markup text "Hello"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then insertions count is 1
    And total setDecorations calls is 22

  Scenario: Auto mode - two authors activates per-author coloring
    Given author colors mode "auto"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "bob" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 24

  Scenario: Auto mode - no author metadata uses semantic colors
    Given author colors mode "auto"
    And markup text "Hello"
    And a change of type "insertion" with no author at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then insertions count is 1
    And total setDecorations calls is 22

  Scenario: Auto mode - mixed authored and unauthored with single author uses semantic
    Given author colors mode "auto"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "deletion" with no author at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then insertions count is 1
    And deletions count is 1
    And total setDecorations calls is 22

  Scenario: Auto mode - three changes with two distinct authors activates per-author
    Given author colors mode "auto"
    And markup text "aaa bbb ccc"
    And a change of type "insertion" by "alice" at offset 0 to 3
    And a change of type "insertion" by "alice" at offset 4 to 7
    And a change of type "insertion" by "bob" at offset 8 to 11
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 24

  Scenario: Always mode - single author still uses per-author coloring
    Given author colors mode "always"
    And markup text "Hello"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And total setDecorations calls is 23

  Scenario: Always mode - no author metadata still uses semantic
    Given author colors mode "always"
    And markup text "Hello"
    And a change of type "insertion" with no author at offset 0 to 5
    When I decorate the manual changes in markup mode
    Then insertions count is 1
    And total setDecorations calls is 22

  Scenario: Never mode - two authors still uses semantic colors
    Given author colors mode "never"
    And markup text "Hello World"
    And a change of type "insertion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "bob" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then insertions count is 2
    And total setDecorations calls is 22

  Scenario: Never mode - six authors still uses semantic colors
    Given author colors mode "never"
    And markup text "a b c d e f"
    And a change of type "insertion" by "a" at offset 0 to 1
    And a change of type "insertion" by "b" at offset 2 to 3
    And a change of type "insertion" by "c" at offset 4 to 5
    And a change of type "insertion" by "d" at offset 6 to 7
    And a change of type "insertion" by "e" at offset 8 to 9
    And a change of type "insertion" by "f" at offset 10 to 11
    When I decorate the manual changes in markup mode
    Then insertions count is 6
    And total setDecorations calls is 22

  Scenario: Never mode - deletion with author uses semantic red, not author color
    Given author colors mode "never"
    And markup text "Hello World"
    And a change of type "deletion" by "alice" at offset 0 to 5
    And a change of type "insertion" by "alice" at offset 6 to 11
    When I decorate the manual changes in markup mode
    Then deletions count is 1
    And insertions count is 1
    And total setDecorations calls is 22

  Scenario: Default constructor authorColors defaults to auto
    Given markup text "Hello"
    And a change of type "insertion" by "alice" at offset 0 to 5
    When I decorate the manual changes in markup mode
    # auto + single author = semantic
    Then insertions count is 1
    And total setDecorations calls is 22

  # ── Mocha source: Move Decorations (moveRole) ──

  Scenario: Move-from in markup mode uses moveFroms, not deletions
    Given markup text "{--moved text--}"
    And a move-from change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in markup mode
    Then deletions is empty
    And moveFroms count is 1
    And moveFroms has range 0:0 to 0:16

  Scenario: Move-to in markup mode uses moveTos, not insertions
    Given markup text "{++moved text++}"
    And a move-to change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in markup mode
    Then insertions is empty
    And moveTos count is 1
    And moveTos has range 0:0 to 0:16

  Scenario: Move-from in smart view settled-base: entirely hidden (cursor far away)
    Given markup text "{--moved text--}"
    And a move-from change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in smart view mode
    Then deletions is empty
    And moveFroms is empty
    And hiddens count is 1
    And hiddens has range 0:0 to 0:16

  Scenario: Move-to in smart view settled-base: plain text, delimiters hidden (cursor far away)
    Given markup text "{++moved text++}"
    And a move-to change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in smart view mode
    Then insertions is empty
    And moveTos is empty
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:13 to 0:16

  Scenario: Cursor inside move-from unfolds delimiters
    Given markup text "{--moved text--}"
    And a move-from change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in smart view mode with cursor at 0:5
    Then moveFroms count is 1
    And moveFroms has range 0:3 to 0:13
    And hiddens count is 2
    And unfolded is empty

  Scenario: Cursor inside move-to unfolds delimiters
    Given markup text "{++moved text++}"
    And a move-to change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in smart view mode with cursor at 0:5
    Then moveTos count is 1
    And moveTos has range 0:3 to 0:13
    And hiddens count is 2
    And unfolded is empty

  Scenario: Non-move deletion still uses deletions array
    Given markup text "{--normal delete--}"
    And a normal deletion at offset 0 to 19 with content 3 to 16
    When I decorate the manual changes in markup mode
    Then deletions count is 1
    And moveFroms is empty

  Scenario: Move pair - one move-from and one move-to in same document
    Given markup text "{--text--} {++text++}"
    And a move-from change at offset 0 to 10 with content 3 to 7
    And a move-to change at offset 11 to 21 with content 14 to 18
    When I decorate the manual changes in markup mode
    Then deletions is empty
    And insertions is empty
    And moveFroms count is 1
    And moveTos count is 1
    And moveFroms has range 0:0 to 0:10
    And moveTos has range 0:11 to 0:21

  Scenario: Move-from active highlight - cursor inside move adds activeHighlight
    Given markup text "{--moved text--}"
    And a move-from change at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in markup mode with cursor at 0:5
    Then activeHighlights count is 1
    And activeHighlights has range 0:0 to 0:16

  Scenario: Authored move-from with always mode routes to author decoration type
    Given author colors mode "always"
    And markup text "{--moved text--}"
    And a move-from change by "alice" at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in markup mode
    Then moveFroms is empty
    And deletions is empty
    And total setDecorations calls is 23

  Scenario: Authored move-to with always mode routes to author decoration type
    Given author colors mode "always"
    And markup text "{++moved text++}"
    And a move-to change by "alice" at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in markup mode
    Then moveTos is empty
    And insertions is empty
    And total setDecorations calls is 23

  Scenario: Authored move with auto mode and single author uses semantic move colors
    Given markup text "{--moved text--}"
    And a move-from change by "alice" at offset 0 to 16 with content 3 to 13
    When I decorate the manual changes in markup mode
    # auto + single author: uses default moveFroms
    Then moveFroms count is 1
    And deletions is empty
    And total setDecorations calls is 22
