@fast @parser @P2
Feature: P2 — Parser basic markup type recognition

  Tests that the parser correctly identifies each of the 5 CriticMarkup types,
  extracts content text, and handles highlight+comment attachment rules.

  Scenario: Parse insertion markup
    Given the input text is:
      """
      Hello {++world++} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has modified text "world"
    And change 1 range starts at 6
    And change 1 range ends at 17

  Scenario: Parse deletion markup
    Given the input text is:
      """
      Hello {--world--} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a deletion
    And change 1 has original text "world"
    And change 1 range starts at 6
    And change 1 range ends at 17

  Scenario: Parse substitution markup with separator
    Given the input text is:
      """
      Hello {~~world~>universe~~} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a substitution
    And change 1 has original text "world"
    And change 1 has modified text "universe"
    And change 1 range starts at 6
    And change 1 range ends at 27

  Scenario: Parse standalone comment
    Given the input text is:
      """
      Hello {>>this is a note<<} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a comment
    And change 1 has comment "this is a note"
    And change 1 range starts at 6
    And change 1 range ends at 26

  Scenario: Parse highlight without comment
    Given the input text is:
      """
      Hello {==important text==} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a highlight
    And change 1 has original text "important text"
    And change 1 has no comment
    And change 1 range starts at 6
    And change 1 range ends at 26

  Scenario: Parse highlight with attached comment
    Given the input text is:
      """
      Hello {==important text==}{>>this is why<<} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a highlight
    And change 1 has original text "important text"
    And change 1 has comment "this is why"
    And change 1 range starts at 6
    And change 1 range ends at 43

  Scenario: Distinguish highlight comment from standalone comment
    Given the input text is:
      """
      Text {==highlighted==}{>>attached<<} and {>>standalone<<}
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 is a highlight
    And change 1 has comment "attached"
    And change 2 is a comment
    And change 2 has comment "standalone"
