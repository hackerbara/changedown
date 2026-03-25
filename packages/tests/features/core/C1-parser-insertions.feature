Feature: Parser — Insertions
  As a consumer of the CriticMarkup parser
  I want insertions to be correctly parsed
  So that change tracking accurately captures added text

  Scenario: Simple insertion
    Given the text "{++added text++}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 has modified text "added text"
    And change 1 has no original text

  Scenario: Insertion within surrounding text
    Given the text "Hello {++world++} there"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 has modified text "world"
    And change 1 has range 6 to 17
    And change 1 has content range 9 to 14

  Scenario: Insertion spanning multiple lines
    Given the text "{++line1\nline2++}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 has modified text "line1\nline2"
    And change 1 has range 0 to 17
    And change 1 has content range 3 to 14

  Scenario: Empty insertion
    Given the text "{++++}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 has modified text ""
    And change 1 has range 0 to 6
    And change 1 has content range 3 to 3

  Scenario: Insertion with footnote ref
    Given the text "{++added++}[^ct-1]"
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-1"
    And change 1 is type "Insertion"
    And change 1 has modified text "added"
    And change 1 has range 0 to 18

  Scenario: Insertion with dotted footnote ref
    Given the text "{++text++}[^ct-17.2]"
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-17.2"
    And change 1 is type "Insertion"
    And change 1 has modified text "text"
    And change 1 has range 0 to 20

  Scenario: Insertion with footnote ref in surrounding text
    Given the text "Hello {++world++}[^ct-1] there"
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-1"
    And change 1 has range 6 to 24
    And change 1 has content range 9 to 14
    And change 1 has modified text "world"

  Scenario: Insertion preserves auto-generated ID when no footnote ref
    Given the text "{++text++}"
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-1"

  Scenario: All insertions have Proposed status by default
    Given the text "{++a++}{++b++}"
    When I parse the text
    Then all changes have status "Proposed"

  Scenario: Insertion generates correct ID prefix
    Given the text "{++a++}{--b--}{~~c~>d~~}"
    When I parse the text
    Then change 1 has id "ct-1"
