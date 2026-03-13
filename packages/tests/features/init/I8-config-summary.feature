Feature: I8 — Config summary parsing
  parseConfigSummary reads an existing config.toml and returns a structured
  summary for display during re-init.

  @fast @I8
  Scenario: Parse summary from default config
    Given a temporary directory with git initialized
    And git config user.name is set to "Alice"
    When I run the setupProject flow in that directory
    And I parse the config summary in that directory
    Then the config summary author is "Alice"
    And the config summary tracking is "**/*.md"
    And the config summary policy is "safety-net"
    And the config summary protocol is "classic"

  @fast @I8
  Scenario: Parse summary returns null when no config exists
    Given a temporary empty directory
    When I parse the config summary in that directory
    Then the config summary is null

  @fast @I8
  Scenario: Parse summary with strict policy mode
    Given a temporary empty directory
    When I generate config with author "Bob" and policyMode "strict"
    And I write the generated config to that directory
    And I parse the config summary in that directory
    Then the config summary policy is "strict"

  @fast @I8
  Scenario: Parse summary with compact protocol mode
    Given a temporary empty directory
    When I generate config with author "Carol" and protocolMode "compact" and reasoning "required"
    And I write the generated config to that directory
    And I parse the config summary in that directory
    Then the config summary protocol is "compact"
