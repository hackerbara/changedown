@core @navigation
Feature: Navigation — nextChange and previousChange
  The navigation module provides cursor-relative traversal of CriticMarkup
  changes in a document. nextChange finds the first change after the cursor;
  previousChange finds the last change before the cursor. Both wrap around
  at document boundaries.

  # --- nextChange ---

  Scenario: Next change from beginning of document
    Given the markup text "Hello {++world++} foo"
    When I parse the markup
    And I navigate to the next change from position 0
    Then the navigated change has modified text "world"

  Scenario: Next change between two changes
    Given the markup text "{++first++} middle {--second--}"
    When I parse the markup
    And I navigate to the next change from position 15
    Then the navigated change has original text "second"

  Scenario: Next change wraps to first when cursor is past all changes
    Given the markup text "{++alpha++} text {--beta--} trailing"
    When I parse the markup
    And I navigate to the next change from position 30
    Then the navigated change has modified text "alpha"

  Scenario: Next change returns null when no changes exist
    Given the markup text "plain text with no markup"
    When I parse the markup
    And I navigate to the next change from position 0
    Then the navigated change is null

  Scenario: Next change skips current change at cursor start
    Given the markup text "{++first++} {--second--}"
    When I parse the markup
    And I navigate to the next change from position 0
    Then the navigated change has original text "second"

  # --- previousChange ---

  Scenario: Previous change from end of document
    Given the markup text "Hello {++world++} end"
    When I parse the markup
    And I navigate to the previous change from position 21
    Then the navigated change has modified text "world"

  Scenario: Previous change between two changes
    Given the markup text "{++first++} middle {--second--}"
    When I parse the markup
    And I navigate to the previous change from position 15
    Then the navigated change has modified text "first"

  Scenario: Previous change wraps to last when cursor is before first change
    Given the markup text "{++alpha++} text {--beta--}"
    When I parse the markup
    And I navigate to the previous change from position 0
    Then the navigated change has original text "beta"

  Scenario: Previous change returns null when no changes exist
    Given the markup text "no markup here"
    When I parse the markup
    And I navigate to the previous change from position 5
    Then the navigated change is null

  Scenario: Previous change from empty document
    Given the markup text ""
    When I parse the markup
    And I navigate to the previous change from position 0
    Then the navigated change is null

  Scenario: Three changes — sequential forward navigation
    Given the markup text "a{++ins++}b{--del--}c{~~old~>new~~}d"
    When I parse the markup
    And I navigate to the next change from position 0
    Then the navigated change has modified text "ins"

  # --- Additional navigation gap coverage ---

  Scenario: Next wraps to itself — single change document
    Given the markup text "{++only++} trailing"
    When I parse the markup
    And I navigate to the next change from position 12
    Then the navigated change has modified text "only"

  Scenario: Next returns single change when cursor before it
    Given the markup text "prefix {++only++}"
    When I parse the markup
    And I navigate to the next change from position 0
    Then the navigated change has modified text "only"

  Scenario: Next from empty document returns null
    Given the markup text ""
    When I parse the markup
    And I navigate to the next change from position 0
    Then the navigated change is null

  Scenario: Previous wraps to itself — single change document
    Given the markup text "prefix {--only--}"
    When I parse the markup
    And I navigate to the previous change from position 0
    Then the navigated change has original text "only"

  Scenario: Previous adjacent boundary returns first change at boundary
    Given the markup text "{++a++}{--b--}"
    When I parse the markup
    And I navigate to the previous change from position 7
    Then the navigated change has modified text "a"
