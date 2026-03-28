@visual @slow
Feature: VIS1 -- Visual Regression Baselines

  Pixel-level screenshot comparison against golden baselines for all
  decoration states.  Tests use the same screenshotHelper infrastructure
  (pixelmatch, 0.5 % tolerance) but are now expressed as Gherkin scenarios
  so they appear in the unified Cucumber test surface.

  Golden baselines are stored in src/test/visual/golden/ (local, not committed).
  First run auto-creates baselines; subsequent runs compare and fail on drift.

  # ── Category A: Markup Mode (single-type fixtures) ─────────────────

  @fixture(insertion-single) @markup
  Scenario: Insertion in markup mode
    Given VS Code is open with visual fixture "insertion-single.md"
    Then the editor screenshot matches golden "insertion-markup-mode"

  @fixture(deletion-single) @markup
  Scenario: Deletion in markup mode
    Given VS Code is open with visual fixture "deletion-single.md"
    Then the editor screenshot matches golden "deletion-markup-mode"

  @fixture(substitution-single) @markup
  Scenario: Substitution in markup mode
    Given VS Code is open with visual fixture "substitution-single.md"
    Then the editor screenshot matches golden "substitution-markup-mode"

  @fixture(highlight-plain) @markup
  Scenario: Highlight (plain) in markup mode
    Given VS Code is open with visual fixture "highlight-plain.md"
    Then the editor screenshot matches golden "highlight-plain-markup-mode"

  @fixture(highlight-with-comment) @markup
  Scenario: Highlight with comment in markup mode
    Given VS Code is open with visual fixture "highlight-with-comment.md"
    Then the editor screenshot matches golden "highlight-comment-markup-mode"

  # ── Category A extended: multi-line + dense markup mode ────────────

  @fixture(insertion-multiline) @markup
  Scenario: Multi-line insertion in markup mode
    Given VS Code is open with visual fixture "insertion-multiline.md"
    Then the editor screenshot matches golden "insertion-multiline-markup"

  @fixture(deletion-multiline) @markup
  Scenario: Multi-line deletion in markup mode
    Given VS Code is open with visual fixture "deletion-multiline.md"
    Then the editor screenshot matches golden "deletion-multiline-markup"

  @fixture(substitution-multiline) @markup
  Scenario: Multi-line substitution in markup mode
    Given VS Code is open with visual fixture "substitution-multiline.md"
    Then the editor screenshot matches golden "substitution-multiline-markup"

  @fixture(highlight-comment-multiline) @markup
  Scenario: Multi-line highlight+comment in markup mode
    Given VS Code is open with visual fixture "highlight-comment-multiline.md"
    Then the editor screenshot matches golden "highlight-comment-multiline-markup"

  @fixture(adjacent-changes) @markup
  Scenario: Adjacent changes in markup mode
    Given VS Code is open with visual fixture "adjacent-changes.md"
    Then the editor screenshot matches golden "adjacent-changes-markup"

  @fixture(mixed-types-dense) @markup
  Scenario: Mixed types dense in markup mode
    Given VS Code is open with visual fixture "mixed-types-dense.md"
    Then the editor screenshot matches golden "mixed-types-dense-markup"

  @fixture(standalone-comment) @markup
  Scenario: Standalone comment in markup mode
    Given VS Code is open with visual fixture "standalone-comment.md"
    Then the editor screenshot matches golden "standalone-comment-markup"

  # ── Category B: Smart View (delimiters hidden, cursor at file start) ──

  @fixture(insertion-single) @smart
  Scenario: Insertion in smart view
    Given VS Code is open with visual fixture "insertion-single.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "insertion-smart-view"

  @fixture(deletion-single) @smart
  Scenario: Deletion in smart view
    Given VS Code is open with visual fixture "deletion-single.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "deletion-smart-view"

  @fixture(substitution-single) @smart
  Scenario: Substitution in smart view
    Given VS Code is open with visual fixture "substitution-single.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "substitution-smart-view"

  @fixture(highlight-plain) @smart
  Scenario: Highlight (plain) in smart view
    Given VS Code is open with visual fixture "highlight-plain.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "highlight-plain-smart-view"

  @fixture(highlight-with-comment) @smart
  Scenario: Highlight with comment in smart view
    Given VS Code is open with visual fixture "highlight-with-comment.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "highlight-comment-smart-view"

  # ── Category B extended: multi-line + dense smart view ─────────────

  @fixture(insertion-multiline) @smart
  Scenario: Multi-line insertion in smart view
    Given VS Code is open with visual fixture "insertion-multiline.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "insertion-multiline-smart"

  @fixture(deletion-multiline) @smart
  Scenario: Multi-line deletion in smart view
    Given VS Code is open with visual fixture "deletion-multiline.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "deletion-multiline-smart"

  @fixture(substitution-multiline) @smart
  Scenario: Multi-line substitution in smart view
    Given VS Code is open with visual fixture "substitution-multiline.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "substitution-multiline-smart"

  @fixture(highlight-comment-multiline) @smart
  Scenario: Multi-line highlight+comment in smart view
    Given VS Code is open with visual fixture "highlight-comment-multiline.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "highlight-comment-multiline-smart"

  @fixture(adjacent-changes) @smart
  Scenario: Adjacent changes in smart view
    Given VS Code is open with visual fixture "adjacent-changes.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "adjacent-changes-smart"

  @fixture(mixed-types-dense) @smart
  Scenario: Mixed types dense in smart view
    Given VS Code is open with visual fixture "mixed-types-dense.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "mixed-types-dense-smart"

  @fixture(standalone-comment) @smart
  Scenario: Standalone comment in smart view
    Given VS Code is open with visual fixture "standalone-comment.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "standalone-comment-smart"

  # ── Category C: Cursor-Inside Unfolding (smart view + cursor in change) ─

  @fixture(insertion-single) @unfold
  Scenario: Insertion unfold -- cursor inside in smart view
    Given VS Code is open with visual fixture "insertion-single.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 17
    Then the editor screenshot matches golden "insertion-unfold"

  @fixture(deletion-single) @unfold
  Scenario: Deletion unfold -- cursor inside in smart view
    Given VS Code is open with visual fixture "deletion-single.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 17
    Then the editor screenshot matches golden "deletion-unfold"

  @fixture(substitution-single) @unfold
  Scenario: Substitution unfold -- cursor inside in smart view
    Given VS Code is open with visual fixture "substitution-single.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 17
    Then the editor screenshot matches golden "substitution-unfold"

  @fixture(highlight-plain) @unfold
  Scenario: Highlight unfold -- cursor inside in smart view
    Given VS Code is open with visual fixture "highlight-plain.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 17
    Then the editor screenshot matches golden "highlight-unfold"

  @fixture(standalone-comment) @unfold
  Scenario: Comment unfold -- cursor inside in smart view
    Given VS Code is open with visual fixture "standalone-comment.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 17
    Then the editor screenshot matches golden "comment-unfold"

  # ── Category D: Scroll & Viewport (isolated, smart view) ──────────

  @fixture(long-document-scroll) @scroll @isolated
  Scenario: Scroll to middle -- decorations visible
    Given VS Code is open with visual fixture "long-document-scroll.md"
    When I switch to "simple" view mode
    And I position the cursor at line 39 column 0
    Then the editor screenshot matches golden "scroll-to-middle"

  @fixture(long-document-scroll) @scroll @isolated
  Scenario: Scroll to bottom -- decorations visible
    Given VS Code is open with visual fixture "long-document-scroll.md"
    When I switch to "simple" view mode
    And I press "Meta+End"
    Then the editor screenshot matches golden "scroll-to-bottom"

  @fixture(long-document-scroll) @scroll @isolated
  Scenario: Scroll down then back up -- decorations stable
    Given VS Code is open with visual fixture "long-document-scroll.md"
    When I switch to "simple" view mode
    And I press "Meta+End"
    And I wait 1000 milliseconds
    And I press "Meta+Home"
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "scroll-back-to-top"

  # ── Category E: Live Interaction (isolated, mutates document) ──────

  @fixture(insertion-single) @interaction @isolated @destructive
  Scenario: Tracking mode typing wraps in insertion markup
    Given VS Code is open with visual fixture "insertion-single.md"
    When I position the cursor at line 2 column 0
    And I press "End"
    And I execute "ChangeDown: Toggle Tracking"
    And I wait 500 milliseconds
    And I type " extra text" into the editor
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "tracking-mode-typing"

  # ── Category F: Edge Cases ─────────────────────────────────────────

  @fixture(insertion-single) @edge
  Scenario: Cursor at opening delimiter boundary
    Given VS Code is open with visual fixture "insertion-single.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 12
    Then the editor screenshot matches golden "cursor-at-opening-delimiter"

  @fixture(insertion-single) @edge
  Scenario: Cursor at closing delimiter boundary
    Given VS Code is open with visual fixture "insertion-single.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 32
    Then the editor screenshot matches golden "cursor-at-closing-delimiter"

  @fixture(insertion-single) @edge
  Scenario: Cursor one char past change -- no unfold
    Given VS Code is open with visual fixture "insertion-single.md"
    When I switch to "simple" view mode
    And I position the cursor at line 2 column 34
    Then the editor screenshot matches golden "cursor-one-past-change"

  @fixture(empty-changes) @edge
  Scenario: Empty changes in smart view
    Given VS Code is open with visual fixture "empty-changes.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "empty-changes-smart"

  @fixture(special-chars) @edge
  Scenario: Special characters in markup mode
    Given VS Code is open with visual fixture "special-chars.md"
    Then the editor screenshot matches golden "special-chars-markup"

  @fixture(special-chars) @edge
  Scenario: Special characters in smart view
    Given VS Code is open with visual fixture "special-chars.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "special-chars-smart"

  @fixture(boundary-positions) @edge
  Scenario: Boundary positions in markup mode
    Given VS Code is open with visual fixture "boundary-positions.md"
    Then the editor screenshot matches golden "boundary-positions-markup"

  @fixture(boundary-positions) @edge
  Scenario: Boundary positions in smart view
    Given VS Code is open with visual fixture "boundary-positions.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "boundary-positions-smart"

  # ── Category G: Light Theme Variants (isolated) ────────────────────

  @fixture(insertion-single) @light @isolated
  Scenario: Insertion in markup mode -- light theme
    Given VS Code is open with visual fixture "insertion-single.md" using light theme
    Then the editor screenshot matches golden "insertion-markup-light"

  @fixture(deletion-single) @light @isolated
  Scenario: Deletion in markup mode -- light theme
    Given VS Code is open with visual fixture "deletion-single.md" using light theme
    Then the editor screenshot matches golden "deletion-markup-light"

  @fixture(substitution-single) @light @isolated
  Scenario: Substitution in markup mode -- light theme
    Given VS Code is open with visual fixture "substitution-single.md" using light theme
    Then the editor screenshot matches golden "substitution-markup-light"

  @fixture(highlight-plain) @light @isolated
  Scenario: Highlight in markup mode -- light theme
    Given VS Code is open with visual fixture "highlight-plain.md" using light theme
    Then the editor screenshot matches golden "highlight-plain-markup-light"

  @fixture(mixed-types-dense) @light @isolated
  Scenario: Mixed types in markup mode -- light theme
    Given VS Code is open with visual fixture "mixed-types-dense.md" using light theme
    Then the editor screenshot matches golden "mixed-types-dense-markup-light"

  # ── Category H: Stress Test (isolated) ─────────────────────────────

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test top of document -- markup mode dark
    Given VS Code is open with visual fixture "stress-test.md"
    Then the editor screenshot matches golden "stress-top-markup"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test dense section -- markup mode
    Given VS Code is open with visual fixture "stress-test.md"
    When I position the cursor at line 54 column 0
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "stress-dense-markup"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test standalone comments area -- markup mode
    Given VS Code is open with visual fixture "stress-test.md"
    When I position the cursor at line 19 column 0
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "stress-comments-markup"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test footnotes at bottom -- markup mode
    Given VS Code is open with visual fixture "stress-test.md"
    When I position the cursor at line 200 column 0
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "stress-footnotes-markup"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test top of document -- smart view
    Given VS Code is open with visual fixture "stress-test.md"
    When I switch to "simple" view mode
    Then the editor screenshot matches golden "stress-top-smart"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test dense section -- smart view
    Given VS Code is open with visual fixture "stress-test.md"
    When I switch to "simple" view mode
    And I position the cursor at line 54 column 0
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "stress-dense-smart"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test top of document -- markup mode light
    Given VS Code is open with visual fixture "stress-test.md" using light theme
    Then the editor screenshot matches golden "stress-top-light"

  @fixture(stress-test) @stress @isolated
  Scenario: Stress test dense section -- markup mode light
    Given VS Code is open with visual fixture "stress-test.md" using light theme
    When I position the cursor at line 54 column 0
    And I wait 1000 milliseconds
    Then the editor screenshot matches golden "stress-dense-light"
