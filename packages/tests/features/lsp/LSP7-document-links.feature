@fast @LSP7
Feature: LSP7 - Document Links
  The LSP document links capability makes footnote references clickable.
  Inline [^cn-N] references link to their footnote definitions, and
  definition headers link back to the first inline reference.

  Scenario: Inline ref links to footnote definition
    Given the document text:
      """
      Some text with a change[^cn-1] here.

      [^cn-1]: status: proposed
      """
    When I create document links
    Then there are 2 document links
    And there is a link on line 0 targeting line 2

  Scenario: Footnote definition links back to inline ref
    Given the document text:
      """
      Some text with a change[^cn-1] here.

      [^cn-1]: status: proposed
      """
    When I create document links
    Then there is a link on line 2 targeting line 0

  Scenario: Multiple refs to same footnote all get links
    Given the document text:
      """
      First ref[^cn-1] and second ref[^cn-1] here.

      [^cn-1]: status: proposed
      """
    When I create document links
    Then there are 3 document links
    And there are 2 links on line 0

  Scenario: Non-existent ref with no definition produces no link
    Given the document text:
      """
      A ref to nothing[^cn-99] here.

      [^cn-1]: status: proposed
      """
    When I create document links
    Then there are 0 document links

  Scenario: Dotted IDs like [^cn-1.1] link correctly
    Given the document text:
      """
      A move operation[^cn-1.1] was tracked.

      [^cn-1.1]: status: proposed
      """
    When I create document links
    Then there are 2 document links
    And there is a link on line 0 targeting line 2

  Scenario: Multiple independent footnotes produce correct links
    Given the document text:
      """
      Change one[^cn-1] and change two[^cn-2] here.

      [^cn-1]: status: proposed
      [^cn-2]: status: accepted
      """
    When I create document links
    Then there are 4 document links
    And there are 2 links on line 0

  Scenario: Empty document produces no links
    Given the document text ""
    When I create document links
    Then there are 0 document links
