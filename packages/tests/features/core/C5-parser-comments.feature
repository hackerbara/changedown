Feature: Parser — Comments
  As a consumer of the CriticMarkup parser
  I want comments to be correctly parsed
  So that annotations and notes are captured alongside changes

  Scenario: Standalone comment
    Given the text "{>>a note<<}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Comment"
    And change 1 has range 0 to 12
    And change 1 has content range 3 to 9
    And change 1 has comment "a note"

  Scenario: Empty comment
    Given the text "{>><<}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Comment"
    And change 1 has comment ""

  Scenario: Standalone comment within surrounding text
    Given the text "Some text {>>standalone comment<<} more text"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Comment"
    And change 1 has comment "standalone comment"
    And change 1 has range 10 to 34
    And change 1 has content range 13 to 31

  Scenario: Comment attached to highlight is absorbed — not standalone
    Given the text "{==X==}{>>Y<<}"
    When I parse the text
    Then there is 1 change
    And change 1 is type "Highlight"
    And change 1 has comment "Y"

  Scenario: Three adjacent nodes — highlight absorbs comment
    Given the text "{==X==}{>>Y<<}{++Z++}"
    When I parse the text
    Then there are 2 changes
    And change 1 is type "Highlight"
    And change 1 has original text "X"
    And change 1 has comment "Y"
    And change 1 has range 0 to 14
    And change 2 is type "Insertion"
    And change 2 has modified text "Z"
    And change 2 has range 14 to 21

  Scenario: Comment generates correct ID prefix
    Given the text "{>>note<<}"
    When I parse the text
    Then change 1 has id "com-0"
