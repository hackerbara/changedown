Feature: C11 - Accept and Reject Operations
  Accept and reject operations resolve CriticMarkup changes. Accept keeps
  the intended change; reject reverts to the original state. Both operations
  remove CriticMarkup delimiters and produce clean text.

  Background:
    Given the parser is initialized

  # ===== Accept operations =====

  Scenario: Accept insertion keeps the inserted text
    Given the text is "Hello {++beautiful ++}world"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Hello beautiful world"

  Scenario: Accept deletion removes the deleted text
    Given the text is "Hello {--ugly --}world"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Hello world"

  Scenario: Accept substitution keeps the new text
    Given the text is "Hello {~~old~>new~~} world"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Hello new world"

  Scenario: Accept highlight removes delimiters and keeps text
    Given the text is "Hello {==important==} world"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Hello important world"

  Scenario: Accept comment removes the comment entirely
    Given the text is "Hello {>>note<<} world"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Hello  world"

  # ===== Reject operations =====

  Scenario: Reject insertion removes the inserted text
    Given the text is "Hello {++beautiful ++}world"
    When I parse the text
    And I reject change 0
    Then the resulting text is "Hello world"

  Scenario: Reject deletion restores the deleted text
    Given the text is "Hello {--ugly --}world"
    When I parse the text
    And I reject change 0
    Then the resulting text is "Hello ugly world"

  Scenario: Reject substitution keeps the original text
    Given the text is "Hello {~~old~>new~~} world"
    When I parse the text
    And I reject change 0
    Then the resulting text is "Hello old world"

  Scenario: Reject highlight keeps the highlighted text
    Given the text is "Hello {==important==} world"
    When I parse the text
    And I reject change 0
    Then the resulting text is "Hello important world"

  Scenario: Reject comment removes the comment entirely
    Given the text is "Hello {>>note<<} world"
    When I parse the text
    And I reject change 0
    Then the resulting text is "Hello  world"

  # ===== Scenario Outline: Accept/Reject type matrix =====

  Scenario Outline: Accept <type> change
    Given the text is "<markup>"
    When I parse the text
    And I accept change 0
    Then the resulting text is "<accept_result>"

    Examples:
      | type         | markup                         | accept_result        |
      | insertion    | before {++added ++}after       | before added after   |
      | deletion     | before {--removed --}after     | before after         |
      | substitution | before {~~old~>new~~} after    | before new after     |
      | highlight    | before {==marked==} after      | before marked after  |
      | comment      | before {>>note<<} after        | before  after        |

  Scenario Outline: Reject <type> change
    Given the text is "<markup>"
    When I parse the text
    And I reject change 0
    Then the resulting text is "<reject_result>"

    Examples:
      | type         | markup                         | reject_result        |
      | insertion    | before {++added ++}after       | before after         |
      | deletion     | before {--removed --}after     | before removed after |
      | substitution | before {~~old~>new~~} after    | before old after     |
      | highlight    | before {==marked==} after      | before marked after  |
      | comment      | before {>>note<<} after        | before  after        |

  # ===== Footnote reference preservation =====

  Scenario: Accept insertion preserves footnote reference
    Given the text is "Hello {++beautiful ++}[^cn-1]world"
    When I parse the text
    And I accept change 0
    Then the resulting text contains "[^cn-1]"
    And the resulting text contains "beautiful"

  Scenario: Accept deletion preserves footnote reference
    Given the text is "Hello {--ugly --}[^cn-1]world"
    When I parse the text
    And I accept change 0
    Then the resulting text contains "[^cn-1]"
    And the resulting text does not contain "ugly"

  Scenario: Reject insertion preserves footnote reference
    Given the text is "Hello {++beautiful ++}[^cn-1]world"
    When I parse the text
    And I reject change 0
    Then the resulting text contains "[^cn-1]"
    And the resulting text does not contain "beautiful"

  # ===== Multiple changes in reverse document order =====

  Scenario: Accept multiple changes processes in reverse order
    Given the text is "{++first ++}{++second ++}end"
    When I parse the text
    And I accept all changes
    Then the resulting text is "first second end"

  Scenario: Mixed accept and reject on multiple changes
    Given the text is "{++keep ++}{--remove --}end"
    When I parse the text
    And I accept change 0
    And I reject change 1
    Then the resulting text contains "keep"
    And the resulting text contains "remove"

  # ===== Accept all / Reject all =====

  Scenario: Accept all changes at once
    Given the text is "{++one ++}{++two ++}{++three ++}end"
    When I parse the text
    And I accept all changes
    Then the resulting text is "one two three end"

  Scenario: Reject all changes at once
    Given the text is "{++one ++}{++two ++}{++three ++}end"
    When I parse the text
    And I reject all changes
    Then the resulting text is "end"

  Scenario: Accept all with mixed types
    Given the text is "{++added ++}{--deleted --}{~~old~>new~~} end"
    When I parse the text
    And I accept all changes
    Then the resulting text is "added new end"

  Scenario: Reject all with mixed types
    Given the text is "{++added ++}{--deleted --}{~~old~>new~~} end"
    When I parse the text
    And I reject all changes
    Then the resulting text is "deleted old end"

  # ===== Footnote status edits =====

  Scenario: computeFootnoteStatusEdits updates proposed to accepted
    Given the text is:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-02-17 | ins | proposed
      """
    When I compute footnote status edits for "cn-1" to "accepted"
    And I apply the status edits
    Then the resulting text contains "| accepted"

  Scenario: computeFootnoteStatusEdits updates proposed to rejected
    Given the text is:
      """
      Hello {--world--}[^cn-2]

      [^cn-2]: @alice | 2026-02-17 | del | proposed
      """
    When I compute footnote status edits for "cn-2" to "rejected"
    And I apply the status edits
    Then the resulting text contains "| rejected"

  Scenario: Already matching status produces no edits
    Given the text is:
      """
      [^cn-1]: @alice | 2026-02-17 | ins | accepted
      """
    When I compute footnote status edits for "cn-1" to "accepted"
    Then the footnote status edits are empty

  # ===== Edge cases: empty content =====

  Scenario: Accept empty insertion removes delimiters leaving nothing
    Given the text is "before{++++}after"
    When I parse the text
    And I accept change 0
    Then the resulting text is "beforeafter"

  Scenario: Reject empty deletion removes delimiters leaving nothing
    Given the text is "before{----}after"
    When I parse the text
    And I reject change 0
    Then the resulting text is "beforeafter"

  Scenario: Accept empty highlight removes delimiters leaving nothing
    Given the text is "before{====}after"
    When I parse the text
    And I accept change 0
    Then the resulting text is "beforeafter"

  Scenario: Accept substitution with empty modified text replaces old with nothing
    Given the text is "before{~~old~>~~}after"
    When I parse the text
    And I accept change 0
    Then the resulting text is "beforeafter"

  Scenario: Reject substitution with whitespace-only original keeps whitespace
    Given the text is "before{~~  ~>new~~}after"
    When I parse the text
    And I reject change 0
    Then the resulting text is "before  after"

  # ===== Edge cases: multi-line content =====

  Scenario: Accept multi-line insertion preserves line breaks
    Given the text is:
      """
      Start
      {++line one
      line two
      ++}End
      """
    When I parse the text
    And I accept change 0
    Then the resulting text is:
      """
      Start
      line one
      line two
      End
      """

  Scenario: Accept multi-line deletion removes all lines
    Given the text is:
      """
      Start
      {--line one
      line two
      --}End
      """
    When I parse the text
    And I accept change 0
    Then the resulting text is:
      """
      Start
      End
      """

  Scenario: Accept multi-line substitution replaces with new text
    Given the text is:
      """
      Before {~~old line
      old line 2~>new line
      new line 2~~} After
      """
    When I parse the text
    And I accept change 0
    Then the resulting text is:
      """
      Before new line
      new line 2 After
      """

  # ===== Edge cases: document boundaries =====

  Scenario: Accept insertion at document start (position 0)
    Given the text is "{++First ++}rest of text"
    When I parse the text
    And I accept change 0
    Then the resulting text is "First rest of text"

  Scenario: Accept insertion at document end
    Given the text is "Some text{++ last++}"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Some text last"

  Scenario: Accept deletion of entire document content
    Given the text is "{--everything--}"
    When I parse the text
    And I accept change 0
    Then the resulting text is ""

  Scenario: Reject insertion that is the entire document
    Given the text is "{++everything++}"
    When I parse the text
    And I reject change 0
    Then the resulting text is ""

  # ===== Edge cases: special content =====

  Scenario: Accept insertion containing curly braces
    Given the text is "{++function() { return true; }++}"
    When I parse the text
    And I accept change 0
    Then the resulting text is "function() { return true; }"

  Scenario: Accept insertion containing unicode characters
    Given the text is "{++Hello World++}"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Hello World"

  # ===== Compound types =====

  Scenario: Accept highlight with attached comment keeps text only
    Given the text is "Read {==this part==}{>>review needed<<} carefully"
    When I parse the text
    And I accept change 0
    Then the resulting text is "Read this part carefully"

  # ===== computeApprovalLineEdit =====

  Scenario: computeApprovalLineEdit inserts approved line after footnote header
    Given the text is:
      """
      Hello {++world++}[^cn-1] end

      [^cn-1]: @alice | 2026-02-10 | ins | proposed
      """
    When I compute approval line edit for "cn-1" as "accepted" by "carol" on "2026-02-12"
    And I apply the approval edit
    Then the resulting text contains "approved: @carol 2026-02-12"

  Scenario: computeApprovalLineEdit returns null for missing footnote
    Given the text is:
      """
      Hello [^cn-1]

      [^cn-1]: @alice | 2026-02-10 | ins | proposed
      """
    When I compute approval line edit for "cn-99" as "accepted" by "alice" on "2026-02-12"
    Then the approval edit is null
