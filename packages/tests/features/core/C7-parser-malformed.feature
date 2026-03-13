Feature: Parser — Malformed Input
  As a consumer of the CriticMarkup parser
  I want malformed or incomplete markup to be gracefully handled
  So that the parser does not crash or produce incorrect results

  Scenario: Unclosed insertion is skipped
    Given the text "hello {++unclosed text"
    When I parse the text
    Then there are 0 changes

  Scenario: Unclosed deletion is skipped
    Given the text "{--no close"
    When I parse the text
    Then there are 0 changes

  Scenario: Unclosed substitution is skipped
    Given the text "{~~old~>new"
    When I parse the text
    Then there are 0 changes

  Scenario: Unclosed highlight is skipped
    Given the text "{==no close"
    When I parse the text
    Then there are 0 changes

  Scenario: Unclosed comment is skipped
    Given the text "{>>no close"
    When I parse the text
    Then there are 0 changes

  Scenario: Substitution without ~> separator is skipped
    Given the text "{~~oldnew~~}"
    When I parse the text
    Then there are 0 changes

  Scenario: Substitution without separator — alternate
    Given the text "{~~nosep~~}"
    When I parse the text
    Then there are 0 changes

  Scenario: Plain text produces no changes
    Given the text "This is plain text with no markup."
    When I parse the text
    Then there are 0 changes

  Scenario: Empty string produces no changes
    Given the text ""
    When I parse the text
    Then there are 0 changes

  Scenario: Unclosed markup followed by valid markup
    Given the text "{--unclosed then {++valid++}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 has modified text "valid"

  Scenario: Partial opening delimiters are not parsed
    Given the text "{+ {- {~ {= {>"
    When I parse the text
    Then there are 0 changes

  Scenario: Curly brace that is not a delimiter
    Given the text "text {with} curly {++added++} end"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 has modified text "added"

  Scenario: Partial opening delimiter inside content
    Given the text "{++text with {+ partial++}"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "text with {+ partial"

  Scenario: Closing delimiter of different type inside content
    Given the text "{++some --} text++}"
    When I parse the text
    Then there is 1 change
    And change 1 has modified text "some --} text"

  Scenario: Document with all five types — highlight absorbs comment
    Given the text "{++add++}{--del--}{~~old~>new~~}{==mark==}{>>note<<}"
    When I parse the text
    Then there are 4 changes
    And change 1 is type "Insertion"
    And change 2 is type "Deletion"
    And change 3 is type "Substitution"
    And change 4 is type "Highlight"
    And change 4 has comment "note"

  Scenario: Document order is preserved across multiple changes
    Given the text "{++first++} middle {--second--} end {~~old~>new~~}"
    When I parse the text
    Then there are 3 changes
    And change 1 is type "Insertion"
    And change 1 has modified text "first"
    And change 2 is type "Deletion"
    And change 2 has original text "second"
    And change 3 is type "Substitution"
    And change 3 has original text "old"
    And change 3 has modified text "new"
    And changes are in document order

  Scenario: Adjacent markup parsed as separate changes
    Given the text "{++a++}{--b--}"
    When I parse the text
    Then there are 2 changes
    And change 1 is type "Insertion"
    And change 1 has modified text "a"
    And change 1 has range 0 to 7
    And change 2 is type "Deletion"
    And change 2 has original text "b"
    And change 2 has range 7 to 14
