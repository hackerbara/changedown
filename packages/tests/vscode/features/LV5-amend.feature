@fast @LV5
Feature: LV5 — Amend own comment

  Same-author can edit their comment or proposal text.
  Amendments preserve revision history in the footnote.

  Scenario: Amend comment records revision history
    Given an amend document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
          reason: Added greeting
      """
    And current amend author is "@alice"
    When I amend cn-1 inline text to "universe" with reason "Fixed typo"
    Then the amend result inline markup contains "universe"
    And the amend result footnote contains "revised @alice 2026-03-09"
    And the amend result footnote contains "Fixed typo"
    And the amend result footnote contains 'previous: "world"'

  Scenario: Cannot amend another author's change
    Given an amend document with a proposed insertion cn-1 by "@alice"
    And current amend author is "@bob"
    When I try to amend cn-1
    Then the amend is rejected with "same-author"

  Scenario: LV5-03 Amend insertion content
    Given an amend document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added greeting
      """
    And current amend author is "@alice"
    When I amend cn-1 inline text to "universe" with reason "Better scope"
    Then the amend result inline markup contains "{++universe++}"
    And the amend result footnote contains "revised"
    And the amend result footnote contains "Better scope"

  Scenario: LV5-04 Amend deletion is rejected (no modifiable content)
    Given an amend document with text:
      """
      Hello {--world--}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | deletion | proposed
          reason: Cleanup
      """
    And current amend author is "@alice"
    When I try to amend cn-1 with new text "something"
    Then the amend is rejected with "Deletion"

  Scenario: LV5-05 Multi-round amend (amend twice, both revisions recorded)
    Given an amend document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
          reason: Added greeting
      """
    And current amend author is "@alice"
    When I amend cn-1 inline text to "earth" with reason "First revision"
    And I amend cn-1 again to "globe" with reason "Second revision"
    Then the amend result inline markup contains "globe"
    And the amend result footnote contains "First revision"
    And the amend result footnote contains "Second revision"

  Scenario: LV5-06 Amend after request-changes (the response pattern)
    Given an amend document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
          reason: Added greeting
          request-changes: @bob 2026-03-09 "Please fix the typo"
      """
    And current amend author is "@alice"
    When I amend cn-1 inline text to "universe" with reason "Fixed per reviewer feedback"
    Then the amend result inline markup contains "universe"
    And the amend result footnote contains "Fixed per reviewer feedback"
