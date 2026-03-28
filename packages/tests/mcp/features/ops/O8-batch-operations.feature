Feature: Batch operations
  As an AI agent making multiple related changes
  I want to propose and review changes in batches
  So related edits are grouped and processed atomically

  Background:
    Given a tracked file "spec.md" with several paragraphs
    And the config has author.default = "ai:test-agent"

  Scenario: Batch propose creates grouped changes with dotted IDs
    When I call propose_change with a changes array of 3 items
    Then the response contains change_ids "cn-1.1", "cn-1.2", "cn-1.3"
    And all three footnotes share the group prefix "cn-1"

  Scenario: Batch with reasoning per change
    When I call propose_change with changes array where each has reasoning
    Then each footnote contains its respective reasoning

  Scenario: Batch with shared reasoning
    When I call propose_change with top-level reasoning and changes array
    Then each footnote contains the shared reasoning

  Scenario: Batch auto-adjusts coordinates for cascading changes
    When I call propose_change with a changes array where item 1 shifts line numbers
    Then item 2 and 3 are still applied correctly (auto-adjusted)

  Scenario: Batch review approves entire group
    Given a batch of 3 changes (cn-1.1, cn-1.2, cn-1.3)
    When I call review_changes approving all three
    Then all three footnotes show "accepted"

  Scenario: Partial batch review (approve some, reject others)
    Given a batch of 3 changes
    When I approve cn-1.1 and reject cn-1.2 and request_changes on cn-1.3
    Then each footnote reflects its individual decision

  Scenario: Batch affected_lines returns bounded window, not entire file
    Given a tracked file with 50+ lines
    And the config has response.affected_lines = true
    When I call propose_change with a changes array in classic mode (no hashlines)
    Then affected_lines contains fewer than 20 entries
    And affected_lines includes the edit region with context
    But affected_lines does NOT contain the entire file
