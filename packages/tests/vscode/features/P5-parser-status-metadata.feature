@fast @parser @P5
Feature: P5 — Parser status, metadata, and ID generation

  Tests that parsed changes default to Proposed status
  and that each change receives a unique identifier.

  Scenario: All changes default to Proposed status
    Given the input text is:
      """
      {++add++}{--del--}{~~a~>b~~}{>>com<<}{==hi==}
      """
    When I parse the text
    Then all changes have status "proposed"

  Scenario: Each change gets a unique ID
    Given the input text is:
      """
      {++add++}{--del--}{++another++}
      """
    When I parse the text
    Then the parser finds 3 changes
    And all changes have unique IDs
