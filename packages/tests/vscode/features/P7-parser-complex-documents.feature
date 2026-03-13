@fast @parser @P7
Feature: P7 — Parser complex real-world documents

  Tests parsing of documents containing multiple markup types and
  complex highlight+comment patterns.

  Scenario: Document with all five markup types
    Given the input text is:
      """
      # Document Title

      This is a paragraph with {++an addition++} and {--a deletion--}.

      Here is a {~~substitution~>replacement~~} in the middle of a sentence.

      {==This is highlighted text==}{>>with an explanatory comment<<}

      And finally, a standalone {>>comment about the document<<}.
      """
    When I parse the text
    Then the parser finds 5 changes
    And change 1 is an insertion
    And change 2 is a deletion
    And change 3 is a substitution
    And change 4 is a highlight
    And change 4 has comment "with an explanatory comment"
    And change 5 is a comment
    And change 5 has comment "comment about the document"

  Scenario: Multiple highlights — some with comments, some without
    Given the input text is:
      """
      {==first==}{>>comment<<} text {==second==} more {==third==}{>>another<<}
      """
    When I parse the text
    Then the parser finds 3 changes
    And change 1 is a highlight
    And change 1 has comment "comment"
    And change 2 is a highlight
    And change 2 has no comment
    And change 3 is a highlight
    And change 3 has comment "another"
