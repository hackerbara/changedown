Feature: Amend a proposed change
  As the original author of a proposed change
  I want to revise my proposal after receiving feedback
  So the change reflects the improved version

  Background:
    Given a tracked file with a proposed substitution cn-1 by "ai:test-agent"
      | old_text | REST    |
      | new_text | GraphQL |

  Scenario: Amend substitution with new text
    When I call amend_change with:
      | change_id | cn-1    |
      | new_text  | gRPC    |
      | reasoning | gRPC better for internal services |
    Then the inline markup changes from "{~~REST~>GraphQL~~}" to "{~~REST~>gRPC~~}"
    And the footnote for cn-1 has status "rejected"
    And the footnote contains "superseded-by: cn-2"
    And the footnote contains "supersedes: cn-1"

  Scenario: Amend only reasoning (no text change for deletion)
    Given a proposed deletion cn-2 by "ai:test-agent"
    When I call amend_change with:
      | change_id | cn-2    |
      | reasoning | Updated rationale |
    Then the inline markup is unchanged
    And the footnote for cn-2 has status "rejected"
    And the footnote contains "superseded-by: cn-3"
    And the footnote contains "supersedes: cn-2"

  Scenario: Cross-author amendment creates alternative via supersede
    When I call amend_change with author "ai:other-agent"
    Then the response is not an error
    And the footnote for cn-1 has status "rejected"
    And the footnote contains "superseded-by: cn-2"
    And the footnote contains "supersedes: cn-1"

  Scenario: Amending accepted change is rejected
    Given cn-1 has been accepted
    When I call amend_change for cn-1
    Then the response is an error
    And the error mentions status "accepted"

  Scenario: Amendment preserves change ID and thread
    When I call amend_change for cn-1 with new_text "gRPC"
    Then the change ID remains "cn-1"
    And existing discussion entries are preserved
