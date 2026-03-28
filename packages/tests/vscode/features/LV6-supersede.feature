@fast @LV6
Feature: LV6 — Supersede change

  A different author can atomically reject a proposed change and
  propose a replacement. Links both via supersedes/superseded-by.

  Scenario: Supersede rejects original and creates replacement
    Given a supersede document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
      """
    And supersede author is "@bob"
    When I supersede cn-1 with "universe" and reason "Better word choice"
    Then the supersede result footnote status for cn-1 is "rejected"
    And a new change exists in the supersede result with text "universe"
    And the new change supersede result footnote contains "supersedes: cn-1"

  # @wip: core computeSupersedeResult does not enforce same-author guard yet.
  # This scenario is a RED-phase witness for future core behavior.
  @wip
  Scenario: LV6-02 Cannot supersede own change
    Given a supersede document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
      """
    And supersede author is "@alice"
    When I try to supersede cn-1 with "universe" and reason "Self-supersede"
    Then the supersede is rejected

  Scenario: LV6-03 Cannot supersede already-accepted change
    Given a supersede document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | accepted
          approved: @carol 2026-03-09 "Looks good"
      """
    And supersede author is "@bob"
    When I try to supersede cn-1 with "universe" and reason "Better choice"
    Then the supersede is rejected with "accepted"

  Scenario: LV6-04 Cannot supersede already-rejected change
    Given a supersede document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | rejected
          rejected: @carol 2026-03-09 "Not needed"
      """
    And supersede author is "@bob"
    When I try to supersede cn-1 with "universe" and reason "Better choice"
    Then the supersede is rejected with "rejected"

  Scenario: LV6-05 Superseded-by back-link written to original footnote
    Given a supersede document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
      """
    And supersede author is "@bob"
    When I supersede cn-1 with "universe" and reason "Better word choice"
    Then the supersede result footnote for cn-1 contains "superseded-by:"

  Scenario: LV6-06 Supersede with reason records rejection reason on original
    Given a supersede document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | proposed
      """
    And supersede author is "@bob"
    When I supersede cn-1 with "universe" and reason "Outdated terminology"
    Then the supersede result footnote for cn-1 contains "Outdated terminology"

  Scenario: LV6-07 Supersede on insertion type
    Given a supersede document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """
    And supersede author is "@bob"
    When I supersede cn-1 with "universe" and reason "Different word"
    Then the supersede result footnote status for cn-1 is "rejected"
    And a new change exists in the supersede result with text "universe"
