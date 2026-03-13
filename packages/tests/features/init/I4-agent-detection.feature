Feature: I4 - Agent Detection
  Detect installed AI coding agents on the system.

  Scenario: Detects claude command when available
    When I detect agents
    Then the agent list includes an entry for "claude"
    And each agent entry has a "detected" boolean
    And each agent entry has a "configured" boolean

  Scenario: Detects cursor command when available
    When I detect agents
    Then the agent list includes an entry for "cursor"

  Scenario: Detects opencode command when available
    When I detect agents
    Then the agent list includes an entry for "opencode"

  Scenario: Agent detection returns consistent structure
    When I detect agents
    Then each agent has name, detected, and configured fields
