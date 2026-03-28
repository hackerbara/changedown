Feature: Review changes via Surface B (classic MCP)
  As an AI agent or human reviewer
  I want to approve, reject, or request changes on proposals
  So that deliberation is captured in the file

  Background:
    Given a tracked file "doc.md" with two proposed changes:
      | id   | type | old_text | new_text |
      | cn-1 | sub  | REST     | GraphQL  |
      | cn-2 | ins  |          | caching layer |
    And the config has settlement.auto_on_approve = false

  # --- Single review ---

  Scenario: Approve a change records decision in footnote
    When I call review_changes with:
      | reviews | [{"change_id": "cn-1", "decision": "approve", "reasoning": "verified"}] |
    Then the response shows cn-1 approved
    And the footnote for cn-1 contains "approved: @ai:test-agent"
    And the footnote status is updated to "accepted"
    And the inline markup is still present (no settlement)

  Scenario: Reject a change records decision in footnote
    When I call review_changes with:
      | reviews | [{"change_id": "cn-2", "decision": "reject", "reasoning": "not needed"}] |
    Then the footnote for cn-2 contains "rejected: @ai:test-agent"
    And the footnote status is updated to "rejected"

  Scenario: Request changes records without changing status
    When I call review_changes with:
      | reviews | [{"change_id": "cn-1", "decision": "request_changes", "reasoning": "needs benchmark data"}] |
    Then the footnote for cn-1 contains "request-changes: @ai:test-agent"
    And the footnote status remains "proposed"

  # --- Batch review ---

  Scenario: Review multiple changes atomically
    When I call review_changes with reviews for both cn-1 (approve) and cn-2 (reject)
    Then both decisions are recorded
    And cn-1 footnote status is "accepted"
    And cn-2 footnote status is "rejected"

  # --- Thread responses ---

  Scenario: Respond to a change thread
    When I call review_changes with:
      | responses | [{"change_id": "cn-1", "response": "Have you benchmarked this?", "label": "question"}] |
    Then the footnote for cn-1 contains a new discussion entry
    And the entry has label "question"
    And the entry has the response text

  Scenario: Mixed reviews and responses in one call
    When I call review_changes with both reviews and responses
    Then reviews are applied first
    And responses are applied second
    And all changes are reflected in the file

  # --- Error cases ---

  Scenario: Review nonexistent change_id returns per-change error
    When I call review_changes with change_id "cn-999"
    Then the response contains an error for cn-999
    And other valid reviews in the same call succeed
