Feature: I5 — Environment detection
  ChangeDown init adapts its output based on the runtime environment.

  @fast @I5
  Scenario: Detects VS Code integrated terminal
    Given the environment variable VSCODE_PID is set to "12345"
    When I call detectEnvironment
    Then the environment type is "vscode"

  @fast @I5
  Scenario: Detects plain terminal with Claude Code
    Given the environment variable VSCODE_PID is not set
    And the command "claude" is available on PATH
    When I call detectEnvironment
    Then the environment type is "terminal-agent"

  @fast @I5
  Scenario: Detects plain terminal without agents
    Given the environment variable VSCODE_PID is not set
    And no agent commands are available on PATH
    When I call detectEnvironment
    Then the environment type is "terminal-plain"

  @fast @I5
  Scenario: Detects non-interactive CI environment
    Given stdout is not a TTY
    When I call detectEnvironment
    Then the environment type is "ci"
