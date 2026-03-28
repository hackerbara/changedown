Feature: Parser — Highlights
  As a consumer of the CriticMarkup parser
  I want highlights to be correctly parsed
  So that change tracking accurately captures marked text

  Scenario: Simple highlight
    Given the text "{==highlighted==}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has original text "highlighted"
    And change 1 has range 0 to 17
    And change 1 has content range 3 to 14
    And change 1 has no metadata

  Scenario: Empty highlight
    Given the text "{====}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has original text ""

  Scenario: Highlight with immediately attached comment produces ONE node
    Given the text "{==highlighted==}{>>this is a comment<<}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has original text "highlighted"
    And change 1 has range 0 to 40
    And change 1 has content range 3 to 14
    And change 1 has comment "this is a comment"

  Scenario: Highlight absorbs adjacent comment metadata
    Given the text "{==X==}{>>Y<<}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has comment "Y"

  Scenario: Highlight with empty attached comment
    Given the text "{==text==}{>><<}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has range 0 to 16
    And change 1 has comment ""

  Scenario: Highlight does not absorb unclosed adjacent comment
    Given the text "{==text==}{>>unclosed"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has range 0 to 10
    And change 1 has no metadata

  Scenario: Whitespace between highlight and comment produces TWO nodes
    Given the text "{==text==} {>>comment<<}"
    When I parse the text
    Then there are 2 changes
    And change 1 is type "Highlight"
    And change 1 has original text "text"
    And change 1 has range 0 to 10
    And change 1 has no metadata
    And change 2 is type "Comment"
    And change 2 has range 11 to 24

  Scenario: Newline between highlight and comment produces TWO nodes
    Given the text "{==text==}\n{>>comment<<}"
    When I parse the text
    Then there are 2 changes
    And change 1 is type "Highlight"
    And change 1 has range 0 to 10
    And change 2 is type "Comment"
    And change 2 has range 11 to 24

  Scenario: Highlight with footnote ref
    Given the text "{==text==}[^cn-4]"
    When I parse the text
    Then there is 1 change
    And change 1 has id "cn-4"
    And change 1 is type "Highlight"
    And change 1 has original text "text"
    And change 1 has range 0 to 17

  Scenario: Highlight plus comment with footnote ref
    Given the text "{==text==}{>>note<<}[^cn-5]"
    When I parse the text
    Then there is 1 change
    And change 1 has id "cn-5"
    And change 1 is type "Highlight"
    And change 1 has original text "text"
    And change 1 has comment "note"
    And change 1 has range 0 to 27

  Scenario: Highlight generates correct ID prefix
    Given the text "{==note==}"
    When I parse the text
    Then change 1 has id "cn-1"
