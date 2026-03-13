@fast @ENS
Feature: ENS — ensureL2 promotion

  Tests for the core ensureL2(text, changeOffset, opts) function
  that promotes L0 changes to L2 with ct-ID and footnote.

  Scenario: ENS-01 L0 insertion gets ct-ID and footnote
    Given an ensureL2 document with text:
      """
      Hello {++world++} today.
      """
    When I call ensureL2 on the change at offset 6
    Then the ensureL2 result text contains a footnote reference
    And the ensureL2 result text contains a footnote block starting with "[^ct-1]:"
    And the ensureL2 result changeId is "ct-1"
    And the ensureL2 result promoted is true

  Scenario: ENS-02 L2 change returns unchanged
    Given an ensureL2 document with text:
      """
      Hello {++world++}[^ct-1] today.

      [^ct-1]: @alice | 2026-03-09 | ins | proposed
          @alice 2026-03-09T10:00:00Z: Test
      """
    When I call ensureL2 on the change at offset 6
    Then the ensureL2 result text is unchanged
    And the ensureL2 result changeId is "ct-1"
    And the ensureL2 result promoted is false

  Scenario: ENS-03 Next available ct-ID skips existing IDs
    Given an ensureL2 document with text:
      """
      First {++alpha++}[^ct-1] and second {++beta++} end.

      [^ct-1]: @alice | 2026-03-09 | ins | proposed
          @alice 2026-03-09T10:00:00Z: First
      """
    When I call ensureL2 on the change containing "beta"
    Then the ensureL2 result changeId is "ct-2"
    And the ensureL2 result text contains "[^ct-2]"

  Scenario: ENS-04 Footnote reference inserted after closing delimiter
    Given an ensureL2 document with text:
      """
      A {~~old~>new~~} substitution.
      """
    When I call ensureL2 on the change at offset 2
    Then the ensureL2 result text matches "{~~old~>new~~}[^ct-1]"
    And the ensureL2 result promoted is true

  Scenario: ENS-05 Promoted footnote contains author and date from opts
    Given an ensureL2 document with text:
      """
      Hello {++world++} today.
      """
    When I call ensureL2 on the change at offset 6 with author "bob" and date "2026-03-09"
    Then the ensureL2 footnote block for ct-1 contains "@bob"
    And the ensureL2 footnote block for ct-1 contains today's date
    And the ensureL2 footnote block for ct-1 contains "proposed"

  Scenario: ENS-06 Multiple L0 changes — promote specific one by offset
    Given an ensureL2 document with text:
      """
      {++first++} and {++second++} and {++third++}.
      """
    When I call ensureL2 on the change containing "second"
    Then only the "second" change has a footnote reference in the ensureL2 result
    And the "first" and "third" changes remain L0 in the ensureL2 result
