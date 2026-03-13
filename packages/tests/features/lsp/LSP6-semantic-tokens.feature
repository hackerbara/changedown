@fast @LSP6
Feature: LSP6 - Semantic Tokens
  The LSP semantic tokens capability provides syntax highlighting for
  CriticMarkup changes. Each change type maps to a distinct token type,
  and status/author/thread metadata are encoded as modifier bit flags.

  # --- Token type mapping ---

  Scenario: Insertion produces changetracks-insertion token
    Given the document text "Sample text for testing"
    And a parsed insertion at content range 3-11 with status "Proposed"
    When I build semantic tokens
    Then token 1 has type index 0

  Scenario: Deletion produces changetracks-deletion token
    Given the document text "Sample text for testing"
    And a parsed deletion at content range 3-11 with status "Proposed"
    When I build semantic tokens
    Then token 1 has type index 1

  Scenario: Highlight produces changetracks-highlight token
    Given the document text "Sample text for testing"
    And a parsed highlight at content range 3-11 with status "Proposed"
    When I build semantic tokens
    Then token 1 has type index 2

  Scenario: Comment produces changetracks-comment token
    Given the document text "Sample text for testing"
    And a parsed comment at content range 3-11 with status "Proposed"
    When I build semantic tokens
    Then token 1 has type index 3

  Scenario: Substitution produces two tokens for original and modified
    Given the document text "Sample text for testing"
    And a parsed substitution with original range 3-10 and modified range 12-17
    When I build semantic tokens
    Then there are 2 semantic tokens
    And token 1 has type index 4
    And token 2 has type index 5

  # --- Status modifiers ---

  Scenario: Proposed status sets the proposed modifier bit
    Given the document text "Sample text for testing"
    And a parsed insertion at content range 3-11 with status "Proposed"
    When I build semantic tokens
    Then token 1 has the proposed modifier bit set
    And token 1 does not have the accepted modifier bit set

  Scenario: Accepted status sets the accepted modifier bit
    Given the document text "Sample text for testing"
    And a parsed insertion at content range 3-11 with status "Accepted"
    When I build semantic tokens
    Then token 1 has the accepted modifier bit set
    And token 1 does not have the proposed modifier bit set

  # --- Move token types ---

  Scenario: Insertion with moveRole=to produces moveTo token
    Given the document text "Sample text for testing"
    And a parsed move-to insertion at content range 3-11
    When I build semantic tokens
    Then token 1 has type index 7

  Scenario: Deletion with moveRole=from produces moveFrom token
    Given the document text "Sample text for testing"
    And a parsed move-from deletion at content range 3-11
    When I build semantic tokens
    Then token 1 has type index 6

  # --- Empty input ---

  Scenario: No changes produces empty token data
    Given the document text "Sample text for testing"
    And no parsed changes
    When I build semantic tokens
    Then there are 0 semantic tokens

  # --- Legend ---

  Scenario: Legend includes expected token types
    When I request the semantic tokens legend
    Then the legend includes token type "changetracks-insertion"
    And the legend includes token type "changetracks-deletion"
    And the legend includes token type "changetracks-highlight"
    And the legend includes token type "changetracks-comment"
    And the legend includes modifier "modification"
    And the legend includes modifier "proposed"
    And the legend includes modifier "accepted"
