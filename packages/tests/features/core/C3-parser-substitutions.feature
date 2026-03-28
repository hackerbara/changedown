Feature: Parser — Substitutions
  As a consumer of the CriticMarkup parser
  I want substitutions to be correctly parsed
  So that change tracking accurately captures replaced text

  Scenario: Simple substitution
    Given the text "{~~old~>new~~}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Substitution"
    And change 1 has original text "old"
    And change 1 has modified text "new"
    And change 1 has range 0 to 14
    And change 1 has content range 3 to 11
    And change 1 has original range 3 to 6
    And change 1 has modified range 8 to 11

  Scenario: Substitution within surrounding text
    Given the text "X{~~before~>after~~}Y"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "before"
    And change 1 has modified text "after"
    And change 1 has range 1 to 20
    And change 1 has content range 4 to 17
    And change 1 has original range 4 to 10
    And change 1 has modified range 12 to 17

  Scenario: Substitution spanning multiple lines
    Given the text "{~~old\ntext~>new\ntext~~}"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "old\ntext"
    And change 1 has modified text "new\ntext"
    And change 1 has range 0 to 24

  Scenario: Multiple ~> separators — first one wins
    Given the text "{~~a~>b~>c~~}"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "a"
    And change 1 has modified text "b~>c"

  Scenario: Substitution with empty modified text
    Given the text "{~~old~>~~}"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "old"
    And change 1 has modified text ""

  Scenario: Substitution with whitespace original
    Given the text "{~~  ~>new~~}"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "  "
    And change 1 has modified text "new"

  Scenario: Substitution with backtick-escaped closing delimiter
    Given the text "{~~old~>drops the `{~~` and `~~}` wrapping.~~}"
    When I parse the text
    Then there is 1 change
    And change 1 has original text "old"
    And change 1 has modified text "drops the `{~~` and `~~}` wrapping."

  Scenario: Substitution with footnote ref
    Given the text "{~~old~>new~~}[^cn-3]"
    When I parse the text
    Then there is 1 change
    And change 1 has id "cn-3"
    And change 1 is type "Substitution"
    And change 1 has original text "old"
    And change 1 has modified text "new"
    And change 1 has range 0 to 21

  Scenario: Substitution generates correct ID prefix
    Given the text "{++a++}{--b--}{~~c~>d~~}"
    When I parse the text
    Then change 3 has id "cn-3"
