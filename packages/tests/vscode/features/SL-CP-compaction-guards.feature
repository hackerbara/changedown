@slow @SL-CP @destructive @wip @red
Feature: SL-CP — Compaction guards in running VS Code

  Background:
    Given VS Code is launched with fixture "lifecycle-compaction.md"
    And the extension has finished parsing

  @SL-CP-01
  Scenario: Compact accepted+resolved change succeeds
    When I position cursor inside the ct-1 insertion "ready for compaction"
    And I execute "changetracks.compactChangeFully"
    Then the document contains "ready for compaction" as plain text
    And the current document text does not include "[^ct-1]"
    And I capture evidence screenshot "after-clean-compact"

  @SL-CP-02
  Scenario: Compact proposed change is blocked
    When I position cursor inside the ct-2 insertion "still proposed"
    And I execute "changetracks.compactChangeFully"
    Then an error or warning message appears about "proposed"
    And the document still contains "[^ct-2]"
    And I capture evidence screenshot "compact-blocked-proposed"

  @SL-CP-03
  Scenario: Compact with unresolved discussion shows warning
    When I position cursor inside the ct-3 insertion "has open discussion"
    And I execute "changetracks.compactChangeFully"
    Then a warning dialog appears about "open discussion"
    And I capture evidence screenshot "compact-unresolved-warning"
    When I confirm "Compact Anyway"
    Then the document contains "has open discussion" as plain text
    And the current document text does not include "[^ct-3]"
    And I capture evidence screenshot "after-compact-with-warning"

  @SL-CP-04
  Scenario: Compact accepted without discussion succeeds silently
    When I position cursor inside the ct-4 insertion "clean compact"
    And I execute "changetracks.compactChangeFully"
    Then the document contains "clean compact" as plain text
    And the current document text does not include "[^ct-4]"
    And no warning dialog appeared
    And I capture evidence screenshot "after-silent-compact"
