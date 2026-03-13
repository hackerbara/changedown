@CMP1
Feature: CMP1 — Change compaction
  As a document maintainer
  I want to compact accepted changes to clean up markup
  So that the document remains readable after review cycles

  # ── @fast tier: pure in-process tests ─────────────────────────────────

  @fast
  Scenario: compactToLevel1 preserves content between ref and footnote
    Given a compaction document with text:
      """
      Some text {++added++}[^ct-1] and more content here.

      Another paragraph entirely.

      [^ct-1]: @ai:claude-opus-4.6 | 2026-03-01 | ins | accepted
      """
    When I compact change "ct-1" to Level 1
    Then the compacted document contains "and more content here"
    And the compacted document contains "Another paragraph entirely"

  # ── @slow tier: Playwright + VS Code Electron ─────────────────────────

  @slow @fixture(compaction-test) @destructive
  Scenario: Layer 1 compaction removes inline markup and footnote, adds inline comment
    Given I open "compaction-test.md" in VS Code
    And the ChangeTracks extension is active
    When I navigate to the next change
    And I execute "ChangeTracks: Compact Change"
    Then the document contains "{++"
    And the document contains "quick brown fox"
    And the document does not contain "[^ct-1]:"
    And the document contains "{>>"

  @slow @fixture(compaction-test) @destructive
  Scenario: Layer 2 compaction removes both inline markup and footnote
    Given I open "compaction-test.md" in VS Code
    And the ChangeTracks extension is active
    When I navigate to the next change
    And I execute "ChangeTracks: Compact Change Fully"
    Then the document contains "{++"
    And the document does not contain "[^ct-1]"
    And the document contains "quick brown fox"
    And the document does not contain "{>>"
