@fast @LSP3
Feature: LSP3 - Code Actions
  The LSP code actions capability provides accept/reject quick-fix actions
  for each CriticMarkup change, plus bulk accept-all/reject-all actions.
  Each change type has appropriate action labels and edit semantics.

  # --- Per-change actions ---

  Scenario: Insertion has accept and reject actions
    Given the document text "Hello {++world++}!"
    And a diagnostic for insertion "change-1" at 6-17
    When I request code actions
    Then there is a quick-fix titled "Accept insertion"
    And there is a quick-fix titled "Reject insertion"

  Scenario: Accept insertion keeps content, removes delimiters
    Given the document text "Hello {++world++}!"
    And a diagnostic for insertion "change-1" at 6-17
    When I request code actions
    Then the "Accept insertion" edit replaces range 6-17 with "world"

  Scenario: Reject insertion removes entire markup
    Given the document text "Hello {++world++}!"
    And a diagnostic for insertion "change-1" at 6-17
    When I request code actions
    Then the "Reject insertion" edit replaces range 6-17 with ""

  Scenario: Deletion has accept and reject actions
    Given the document text "Hello {--world--}!"
    And a diagnostic for deletion "change-2" at 6-17
    When I request code actions
    Then the "Accept deletion" edit replaces range 6-17 with ""
    And the "Reject deletion" edit replaces range 6-17 with "world"

  Scenario: Substitution has accept and reject actions
    Given the document text "Hello {~~world~>universe~~}!"
    And a diagnostic for substitution "change-3" at 6-27
    When I request code actions
    Then the "Accept substitution" edit replaces range 6-27 with "universe"
    And the "Reject substitution" edit replaces range 6-27 with "world"

  Scenario: Highlight has only remove action
    Given the document text "Hello {==world==}!"
    And a diagnostic for highlight "change-4" at 6-17
    When I request code actions
    Then there is a quick-fix titled "Remove highlight"
    And there is no quick-fix titled "Reject highlight"

  Scenario: Comment has only remove action
    Given the document text "Hello {>>note<<}!"
    And a diagnostic for comment "change-5" at 6-16
    When I request code actions
    Then there is a quick-fix titled "Remove comment"

  # --- Bulk actions ---

  Scenario: Bulk accept all and reject all are offered
    Given the document text "{++insert++} some {--delete--} text"
    And a diagnostic for insertion "change-1" at 0-12
    And a second change deletion "change-2" at 18-30
    When I request code actions
    Then there is a source action titled "Accept all changes"
    And there is a source action titled "Reject all changes"
