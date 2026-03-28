@fast
Feature: Review with reason

  Agents and humans can accept or reject changes with an optional reason.
  The reason is recorded in the footnote as part of the approval line.
  Request-changes records feedback without changing status.

  Background:
    Given the text is:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """

  Scenario: Accept with reason records approval line
    When I review cn-1 with decision "accepted" and reason "Clear addition" by "bob" on "2026-03-09"
    Then the resulting text contains 'approved: @bob 2026-03-09 "Clear addition"'
    And the resulting text contains "| accepted"

  Scenario: Reject with reason records rejection line
    When I review cn-1 with decision "rejected" and reason "Duplicates existing" by "bob" on "2026-03-09"
    Then the resulting text contains 'rejected: @bob 2026-03-09 "Duplicates existing"'
    And the resulting text contains "| rejected"

  Scenario: Accept without reason when optional
    When I review cn-1 with decision "accepted" without reason by "bob" on "2026-03-09"
    Then the resulting text contains "approved: @bob 2026-03-09"
    And the resulting text does not contain '"'

  Scenario: Request changes does not change status
    When I review cn-1 with decision "request-changes" and reason "Needs rewording" by "bob" on "2026-03-09"
    Then the resulting text contains 'request-changes: @bob 2026-03-09 "Needs rewording"'
    And the resulting text contains "| proposed"
