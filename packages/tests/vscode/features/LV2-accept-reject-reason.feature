@fast @LV2
Feature: LV2 — Accept/reject with reason

  Accept and reject actions respect project config for reason requirement.
  When reason is required, the action includes a reason.
  When optional, quick accept is available.

  Scenario: Accept with reason writes approval line to footnote
    Given a review document with a proposed insertion cn-1
    And reviewer identity is "@bob"
    When I accept cn-1 with reason "Clear and well-structured"
    Then the review result footnote contains "approved: @bob"
    And the review result footnote contains "Clear and well-structured"
    And the review result footnote status is "accepted"

  Scenario: Accept without reason when optional
    Given a review document with a proposed insertion cn-1
    And reason is not required for human harness
    And reviewer identity is "@bob"
    When I accept cn-1 without reason
    Then the review result footnote contains "approved: @bob"
    And the review result footnote does not contain quotes

  Scenario: Reject with reason writes rejection line
    Given a review document with a proposed insertion cn-1
    And reviewer identity is "@bob"
    When I reject cn-1 with reason "Duplicates existing content"
    Then the review result footnote contains "rejected: @bob"
    And the review result footnote contains "Duplicates existing content"
    And the review result footnote status is "rejected"

  Scenario: Request changes records feedback without status change
    Given a review document with a proposed insertion cn-1
    And reviewer identity is "@bob"
    When I request changes on cn-1 with reason "Needs rewording"
    Then the review result footnote contains "request-changes: @bob"
    And the review result footnote contains "Needs rewording"
    And the review result footnote status is "proposed"

  Scenario: Reviewer identity from config setting
    Given a review document with a proposed insertion cn-1
    And changedown.reviewerIdentity is set to "carol"
    When I accept cn-1 without reason
    Then the review result approval line author is "@carol"

  Scenario: Reviewer identity falls back to default
    Given a review document with a proposed insertion cn-1
    And reviewer identity is "@dave"
    When I accept cn-1 without reason
    Then the review result approval line author is "@dave"
