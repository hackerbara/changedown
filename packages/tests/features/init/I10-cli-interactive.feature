Feature: I10 — CLI interactive mode
  The interactive flow guides users through 7+ prompts,
  composes init functions, and shows adaptive next steps.

  @fast @I10
  Scenario: Full interactive flow with defaults
    Given a temporary directory with git initialized
    And git config user.name is set to "Alice"
    And the user answers "Author identity" with "Alice"
    And the user answers "Which files" with "**/*.md"
    And the user selects "Policy mode" as "safety-net"
    And the user selects "author identity" as "optional"
    And the user selects "reasoning" as "optional"
    And the user confirms "Detected agents" with "no"
    And the user confirms "advanced settings" with "no"
    And the user confirms "No .gitignore" with "yes"
    When I run runInit interactively
    Then the file ".changedown/config.toml" exists in that directory
    And the init file ".changedown/config.toml" contains 'default = "Alice"'
    And the prompt "Author identity" was shown
    And the outro contains "Setup complete"
    And a "Next steps" note was shown

  @fast @I10
  Scenario: Advanced settings flow
    Given a temporary directory with git initialized
    And git config user.name is set to "Bob"
    And the user answers all basic prompts with defaults
    And the user confirms "advanced settings" with "yes"
    And the user selects "Protocol mode" as "compact"
    And the user selects "Default view" as "changes"
    And the user confirms "Auto-settle changes on approve" with "no"
    And the user confirms "Auto-settle changes on reject" with "yes"
    And the user confirms "No .gitignore" with "yes"
    When I run runInit interactively
    Then the init file ".changedown/config.toml" contains 'mode = "compact"'
    And the init file ".changedown/config.toml" contains 'default_view = "changes"'
    And the init file ".changedown/config.toml" contains "auto_on_approve = false"

  @fast @I10
  Scenario: Cancellation at author prompt
    Given a temporary directory with git initialized
    And git config user.name is set to "Carol"
    And the user cancels at "Author identity"
    When I run runInit interactively
    Then exit was called with code 0
    And the cancel message contains "cancelled"
    And no config was created

  @fast @I10
  Scenario: Cancellation at policy prompt
    Given a temporary directory with git initialized
    And git config user.name is set to "Dana"
    And the user answers "Author identity" with "Dana"
    And the user answers "Which files" with "**/*.md"
    And the user cancels at "Policy mode"
    When I run runInit interactively
    Then exit was called with code 0
    And no config was created

  @fast @I10
  Scenario: Cancellation at advanced settings prompt
    Given a temporary directory with git initialized
    And git config user.name is set to "Eve"
    And the user answers all basic prompts with defaults
    And the user cancels at "advanced settings"
    When I run runInit interactively
    Then exit was called with code 0

  @fast @I10
  Scenario: Interactive re-init guard shows summary
    Given a temporary directory with git initialized
    And git config user.name is set to "Frank"
    And I run runInit with args "--yes --author=Frank"
    When I run runInit interactively
    Then the intro was shown
    And the clack log contains "Already configured"
    And the clack log contains "Frank"
    And the outro contains "Nothing changed"

  @fast @I10
  Scenario: Settings summary shown after configuration
    Given a temporary directory with git initialized
    And git config user.name is set to "Grace"
    And the user answers all basic prompts with defaults
    And the user confirms "advanced settings" with "no"
    And the user confirms "No .gitignore" with "yes"
    When I run runInit interactively
    Then the clack log contains "Settings applied"
    And the clack log contains "safety-net"

  @fast @I10
  Scenario: Adaptive next steps for VS Code environment
    Given a temporary directory with git initialized
    And git config user.name is set to "Heidi"
    And the detected environment is "vscode"
    And the user answers all basic prompts with defaults
    And the user confirms "advanced settings" with "no"
    And the user confirms "No .gitignore" with "yes"
    When I run runInit interactively
    Then the "Next steps" note contains "Alt+Cmd+T"

  @fast @I10
  Scenario: Adaptive next steps for terminal-agent environment
    Given a temporary directory with git initialized
    And git config user.name is set to "Ivan"
    And the detected environment is "terminal-agent" with agent "claude"
    And the user answers all basic prompts with defaults
    And the user confirms "advanced settings" with "no"
    And the user confirms "No .gitignore" with "yes"
    When I run runInit interactively
    Then the "Next steps" note contains "claude"

  @fast @I10
  Scenario: Agent detection and configuration
    Given a temporary directory with git initialized
    And git config user.name is set to "Judy"
    And the user answers all basic prompts with defaults
    And the user confirms "Detected agents" with "yes"
    And the user confirms "advanced settings" with "no"
    And the user confirms "No .gitignore" with "yes"
    When I run runInit interactively
    Then the file ".changedown/config.toml" exists in that directory
