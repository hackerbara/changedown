Feature: Settlement lifecycle
  As an editor managing a document through its review cycle
  I want to understand the full lifecycle from proposal to clean document
  So I know what state the document is in at each stage

  Background:
    Given a tracked file with 5 proposed changes (ct-1 through ct-5)
    And the config has settlement.auto_on_approve = true

  Scenario: Progressive settlement -- approve changes one at a time
    When I approve ct-1
    Then ct-1 is settled (inline markup removed)
    And ct-2 through ct-5 remain as proposed inline markup
    And the file has 1 accepted footnote and 4 proposed footnotes

    When I approve ct-2 and ct-3
    Then ct-2 and ct-3 are settled
    And ct-4 and ct-5 remain

    When I reject ct-4
    Then ct-4 is settled (text removed for insertion, kept for deletion)

    When I approve ct-5
    Then only footnotes remain in the file
    And the document body is clean CriticMarkup-free text
    And each footnote reflects its final status

  Scenario: Batch settle via explicit settle flag
    Given the config has settlement.auto_on_approve = false
    When I approve ct-1, ct-2, ct-3 (markup persists)
    And I reject ct-4, ct-5 (markup persists)
    Then all 5 changes have decisions but inline markup remains

    When I call review_changes with settle = true
    Then all decided changes are compacted
    And the document body is clean
    And footnotes persist

  Scenario: Settlement preserves document structure
    Given the 5 changes include:
      | ct-1 | insertion at line 3   |
      | ct-2 | deletion at line 5    |
      | ct-3 | substitution at line 7 |
      | ct-4 | insertion at line 10  |
      | ct-5 | substitution at line 12 |
    When all are approved and settled
    Then the document has correct line structure (no orphaned newlines)
    And footnotes are at the end of the file
    And no CriticMarkup delimiters remain in the body

  Scenario: Mixed auto-settle and manual settle
    Given the config has settlement.auto_on_approve = true
    When I approve ct-1 (auto-settled) and approve ct-2 (auto-settled)
    And I change config to settlement.auto_on_approve = false
    And I approve ct-3 (NOT auto-settled, markup persists)
    Then ct-1 and ct-2 are settled, ct-3 has markup
    When I explicitly settle via review_changes settle = true
    Then ct-3 is now settled too
