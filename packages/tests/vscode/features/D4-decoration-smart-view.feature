@fast @D4
Feature: D4 -- Decoration rendering in smart view mode
  Tests that EditorDecorator correctly hides delimiters and shows content
  ranges when showMarkup=false (smart view). Covers all 5 change types,
  multi-line edge cases, highlight+comment interactions, and adjacent changes.
  Cursor is positioned far away (line 99) to verify cursor-outside behavior.

  # ── Mocha source: Smart View Mode (showMarkup=false, cursor outside) ──

  Scenario: Insertion settled-base: plain text, delimiters hidden (cursor far away)
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:14 to 0:17

  Scenario: Deletion settled-base: entirely hidden (cursor far away)
    Given markup text "Hello {--world--} end"
    When I decorate in smart view mode
    Then deletions is empty
    And hiddens count is 1
    And hiddens has range 0:6 to 0:17

  Scenario: Substitution settled-base: new text as plain, old text hidden (cursor far away)
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in smart view mode
    Then substitutionOriginals is empty
    And substitutionModifieds is empty
    And hiddens count is 2
    And hiddens has range 0:6 to 0:14
    And hiddens has range 0:17 to 0:20

  Scenario: Highlight without comment hides 2 delimiter parts
    Given markup text "Hello {==important==} end"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:9 to 0:18
    And hiddens count is 2
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:18 to 0:21

  Scenario: Highlight with comment hides delimiters plus comment, shows icon
    Given markup text "Hello {==text==}{>>note<<} end"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:9 to 0:13
    And highlights at index 0 has hover containing "note"
    And hiddens count is 3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:13 to 0:16
    And hiddens has range 0:16 to 0:26
    And commentIcons count is 1
    And commentIcons has point range 0:13
    And commentIcons at index 0 has hover containing "note"

  Scenario: Standalone comment entirely hidden with icon at start
    Given markup text "Hello{>>feedback<<} end"
    When I decorate in smart view mode
    Then comments is empty
    And hiddens count is 1
    And hiddens has range 0:5 to 0:19
    And commentIcons count is 1
    And commentIcons has point range 0:5
    And commentIcons at index 0 has hover containing "feedback"

  Scenario: Adjacent changes settled-base: insertion plain, deletion hidden (cursor far away)
    Given markup text "{++add++}{--del--}"
    When I decorate in smart view mode
    Then insertions is empty
    And deletions is empty
    And hiddens count is 3
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:6 to 0:9
    And hiddens has range 0:9 to 0:18

  Scenario: Empty insertion settled-base: both delimiters hidden (cursor far away)
    Given markup text "{++++}"
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:3 to 0:6

  # ── Mocha source: Multi-Line Edge Cases ──

  Scenario: Multi-line insertion settled-base: plain text, delimiters hidden (cursor far away)
    Given markup text:
      """
      Start
      {++added
      text++}
      End
      """
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 1:0 to 1:3
    And hiddens has range 2:4 to 2:7

  Scenario: Multi-line substitution settled-base: new text as plain (cursor far away)
    Given markup text:
      """
      {~~old
      text~>new
      code~~}
      """
    When I decorate in smart view mode
    Then substitutionOriginals is empty
    And substitutionModifieds is empty
    And hiddens count is 2
    And hiddens has range 0:0 to 1:6
    And hiddens has range 2:4 to 2:7

  Scenario: Closing delimiter at start of line settled-base: plain text (cursor far away)
    Given markup text:
      """
      {++text
      ++}
      """
    When I decorate in smart view mode
    Then insertions is empty
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 1:0 to 1:3

  Scenario: Multi-line highlight with comment - highlight and icon on different lines
    Given markup text:
      """
      {==highlighted
      text==}{>>comment<<}
      """
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:3 to 1:4
    And highlights at index 0 has hover containing "comment"
    And hiddens count is 3
    And hiddens has range 0:0 to 0:3
    And hiddens has range 1:4 to 1:7
    And hiddens has range 1:7 to 1:20
    And commentIcons count is 1
    And commentIcons has point range 1:4
    And commentIcons at index 0 has hover containing "comment"

  # ── Mocha source: Highlight+Comment Interactions (showMarkup=false) ──

  Scenario: Highlight with comment - 3 non-overlapping hide ranges
    Given markup text "{==text==}{>>note<<}"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:3 to 0:7
    And hiddens count is 3
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:7 to 0:10
    And hiddens has range 0:10 to 0:20
    And commentIcons count is 1
    And commentIcons has point range 0:7

  Scenario: Highlight WITHOUT comment - 2 hiddens, 0 commentIcons
    Given markup text "{==just highlighted==}"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:3 to 0:19
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:19 to 0:22
    And commentIcons is empty

  Scenario: Highlight with comment - hover message on both highlight and commentIcon
    Given markup text "{==text==}{>>my note<<}"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights at index 0 has hover containing "my note"
    And commentIcons count is 1
    And commentIcons at index 0 has hover containing "my note"

  Scenario: Highlight with empty comment - comment branch does NOT activate
    Given markup text "{==text==}{>><<}"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:3 to 0:7
    And hiddens count is 2
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:7 to 0:16
    And commentIcons is empty
    And highlights at index 0 has no hover message

  Scenario: Multiple highlights with comments - 2 highlights, 2 commentIcons
    Given markup text "{==first==}{>>note1<<} text {==second==}{>>note2<<}"
    When I decorate in smart view mode
    Then highlights count is 2
    And highlights has range 0:3 to 0:8
    And highlights has range 0:31 to 0:37
    And highlights at index 0 has hover containing "note1"
    And highlights at index 1 has hover containing "note2"
    And commentIcons count is 2
    And commentIcons has point range 0:8
    And commentIcons has point range 0:37
    And commentIcons at index 0 has hover containing "note1"
    And commentIcons at index 1 has hover containing "note2"
    And hiddens count is 6

  Scenario: Highlight with whitespace gap before comment - NOT attached
    Given markup text "{==text==} {>>separate comment<<}"
    When I decorate in smart view mode
    Then highlights count is 1
    And highlights has range 0:3 to 0:7
    And highlights at index 0 has no hover message
    And comments is empty
    And commentIcons count is 1
    And commentIcons has point range 0:11
    And commentIcons at index 0 has hover containing "separate comment"
    And hiddens count is 3
    And hiddens has range 0:0 to 0:3
    And hiddens has range 0:7 to 0:10
    And hiddens has range 0:11 to 0:33
