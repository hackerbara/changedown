Feature: Settlement lifecycle
  As an editor managing a document through its review cycle
  I want to understand the full lifecycle from proposal to clean document
  So I know what state the document is in at each stage

  Background:
    Given a tracked file with 5 proposed changes (cn-1 through cn-5)
    And the config has settlement.auto_on_approve = true

  Scenario: Progressive settlement -- approve changes one at a time
    When I approve cn-1
    Then cn-1 is settled (inline markup removed)
    And cn-2 through cn-5 remain as proposed inline markup
    And the file has 1 accepted footnote and 4 proposed footnotes

    When I approve cn-2 and cn-3
    Then cn-2 and cn-3 are settled
    And cn-4 and cn-5 remain

    When I reject cn-4
    Then cn-4 is settled (text removed for insertion, kept for deletion)

    When I approve cn-5
    Then only footnotes remain in the file
    And the document body is clean CriticMarkup-free text
    And each footnote reflects its final status

  Scenario: Batch settle via explicit settle flag
    Given the config has settlement.auto_on_approve = false
    When I approve cn-1, cn-2, cn-3 (markup persists)
    And I reject cn-4, cn-5 (markup persists)
    Then all 5 changes have decisions but inline markup remains

    When I call review_changes with settle = true
    Then all decided changes are compacted
    And the document body is clean
    And footnotes persist

  Scenario: Settlement preserves document structure
    Given the 5 changes include:
      | cn-1 | insertion at line 3   |
      | cn-2 | deletion at line 5    |
      | cn-3 | substitution at line 7 |
      | cn-4 | insertion at line 10  |
      | cn-5 | substitution at line 12 |
    When all are approved and settled
    Then the document has correct line structure (no orphaned newlines)
    And footnotes are at the end of the file
    And no CriticMarkup delimiters remain in the body

  Scenario: Mixed auto-settle and manual settle
    Given the config has settlement.auto_on_approve = true
    When I approve cn-1 (auto-settled) and approve cn-2 (auto-settled)
    And I change config to settlement.auto_on_approve = false
    And I approve cn-3 (NOT auto-settled, markup persists)
    Then cn-1 and cn-2 are settled, cn-3 has markup
    When I explicitly settle via review_changes settle = true
    Then cn-3 is now settled too
