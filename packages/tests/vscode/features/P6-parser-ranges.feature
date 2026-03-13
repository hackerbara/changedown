@fast @parser @P6
Feature: P6 — Parser range field correctness

  Tests that range, contentRange, originalRange, and modifiedRange
  are computed correctly for each change type, including multi-line
  substitutions and empty markup.

  Scenario: Insertion has correct range and contentRange
    Given the input text is:
      """
      Hello {++world++} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 6
    And change 1 range ends at 17
    And change 1 content range starts at 9
    And change 1 content range ends at 14

  Scenario: Deletion has correct range and contentRange
    Given the input text is:
      """
      Hello {--world--} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 6
    And change 1 range ends at 17
    And change 1 content range starts at 9
    And change 1 content range ends at 14

  Scenario: Substitution has all four range fields
    Given the input text is:
      """
      Hello {~~world~>universe~~} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 6
    And change 1 range ends at 27
    And change 1 content range starts at 9
    And change 1 content range ends at 24
    And change 1 original range starts at 9
    And change 1 original range ends at 14
    And change 1 modified range starts at 16
    And change 1 modified range ends at 24

  Scenario: Highlight has correct range and contentRange
    Given the input text is:
      """
      Hello {==important==} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 6
    And change 1 range ends at 21
    And change 1 content range starts at 9
    And change 1 content range ends at 18

  Scenario: Comment has correct range and contentRange
    Given the input text is:
      """
      Hello {>>note<<} there
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 6
    And change 1 range ends at 16
    And change 1 content range starts at 9
    And change 1 content range ends at 13

  Scenario: Multi-line substitution has correct ranges
    Given the input text is:
      """
      Line 1
      {~~old
      text~>new
      code~~}
      Line 2
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 7
    And change 1 range ends at 31
    And change 1 original range starts at 10
    And change 1 original range ends at 18
    And change 1 modified range starts at 20
    And change 1 modified range ends at 28

  Scenario: Empty insertion has correct ranges
    Given the input text is:
      """
      Text {++++} more
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 5
    And change 1 range ends at 11
    And change 1 content range starts at 8
    And change 1 content range ends at 8
