@wip @coverage-gap @red @slow @CMP2 @fixture(compaction-test) @destructive
Feature: CMP2 — Change compaction deep coverage
  As a document maintainer
  I want compaction to strip metadata from accepted/rejected changes
  So the document stays readable after review cycles

  Background:
    Given I open "compaction-test.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load

  # ── Compact fully (L2 → L0) ───────────────────────────────
  # Compact Fully removes both the footnote ref AND footnote definition,
  # plus any adjacent comment. The CriticMarkup delimiters remain (that's L0).

  Scenario: CMP2-01 Compact fully strips footnote but preserves delimiters
    When I navigate to the next change
    And I execute "ChangeTracks: Compact Change Fully"
    And I wait for changes to load
    Then the document does not contain "[^ct-1]"
    And the document contains "{++quick brown fox++}"
    And the document contains "jumps over the dog"

  # ── Compact L2 → L1 ───────────────────────────────────────

  Scenario: CMP2-02 Compact preserves surrounding text
    When I navigate to the next change
    And I execute "ChangeTracks: Compact Change"
    And I wait for changes to load
    Then the document does not contain "[^ct-1]"
    And the document contains "{++quick brown fox++}"
    And the document contains "jumps over the dog"

  # ── Sequential compactions ───────────────────────────────────

  Scenario: CMP2-03 Compact first change then second change
    When I navigate to the next change
    And I execute "ChangeTracks: Compact Change Fully"
    And I wait for changes to load
    And I navigate to the next change
    And I execute "ChangeTracks: Compact Change Fully"
    And I wait for changes to load
    Then the document does not contain "[^ct-1]"
    And the document contains "{++quick brown fox++}"
    And the document contains "{++was also added++}"

  # ── Compact on proposed change (guard) ───────────────────────

  Scenario: CMP2-04 Compact on proposed change is blocked
    When I navigate to the next change
    And I navigate to the next change
    And I execute "ChangeTracks: Compact Change Fully"
    And I wait for changes to load
    Then the document contains "{++was also added++}"
    And the document contains "[^ct-2]"

  # ── Level 0 change ──────────────────────────────────────────

  @fixture(all-markup-types)
  Scenario: CMP2-05 Compact on Level 0 change (no footnote)
    Given I open "all-markup-types.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I navigate to the next change
    And I execute "ChangeTracks: Compact Change Fully"
    And I wait for changes to load
    Then the document contains "inserted text"
