Feature: Parser — Deletions
  As a consumer of the CriticMarkup parser
  I want deletions to be correctly parsed
  So that change tracking accurately captures removed text

  Scenario: Simple deletion
    Given the text "{--removed text--}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Deletion"
    And change 1 has original text "removed text"
    And change 1 has no modified text

  Scenario: Deletion within surrounding text
    Given the text "abc{--xyz--}def"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Deletion"
    And change 1 has original text "xyz"
    And change 1 has range 3 to 12
    And change 1 has content range 6 to 9

  Scenario: Deletion spanning multiple lines
    Given the text "A{--first\nsecond\nthird--}B"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "first\nsecond\nthird"
    And change 1 has range 1 to 25
    And change 1 has content range 4 to 22

  Scenario: Empty deletion
    Given the text "{----}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Deletion"
    And change 1 has original text ""

  Scenario: Deletion with footnote ref
    Given the text "{--removed--}[^ct-2]"
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-2"
    And change 1 is type "Deletion"
    And change 1 has original text "removed"
    And change 1 has range 0 to 20
    And change 1 has content range 3 to 10

  Scenario: Deletion containing insertion-like delimiters
    Given the text "{--{++not real++}--}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Deletion"
    And change 1 has original text "{++not real++}"

  Scenario: Deletion generates correct ID prefix
    Given the text "{--x--}{--y--}{--z--}"
    When I parse the text
    Then change 1 has id "ct-1"
    And change 2 has id "ct-2"
    And change 3 has id "ct-3"

  Scenario: Three consecutive deletions
    Given the text "{--x--}{--y--}{--z--}"
    When I parse the text
    Then there are 3 changes
    And change 1 is type "Deletion"
    And change 2 is type "Deletion"
    And change 3 is type "Deletion"
