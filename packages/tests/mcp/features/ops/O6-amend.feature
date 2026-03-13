Feature: Amend a proposed change
  As the original author of a proposed change
  I want to revise my proposal after receiving feedback
  So the change reflects the improved version

  Background:
    Given a tracked file with a proposed substitution ct-1 by "ai:test-agent"
      | old_text | REST    |
      | new_text | GraphQL |

  Scenario: Amend substitution with new text
    When I call amend_change with:
      | change_id | ct-1    |
      | new_text  | gRPC    |
      | reasoning | gRPC better for internal services |
    Then the inline markup changes from "{~~REST~>GraphQL~~}" to "{~~REST~>gRPC~~}"
    And the footnote contains "revised @ai:test-agent"
    And the footnote contains previous text "GraphQL"

  Scenario: Amend only reasoning (no text change for deletion)
    Given a proposed deletion ct-2 by "ai:test-agent"
    When I call amend_change with:
      | change_id | ct-2    |
      | reasoning | Updated rationale |
    Then the inline markup is unchanged
    And the footnote contains "revised @ai:test-agent"

  Scenario: Cross-author amendment is rejected
    When I call amend_change with author "ai:other-agent"
    Then the response is an error
    And the error mentions "author mismatch"

  Scenario: Amending accepted change is rejected
    Given ct-1 has been accepted
    When I call amend_change for ct-1
    Then the response is an error
    And the error mentions status "accepted"

  Scenario: Amendment preserves change ID and thread
    When I call amend_change for ct-1 with new_text "gRPC"
    Then the change ID remains "ct-1"
    And existing discussion entries are preserved
