Feature: I9 — CLI non-interactive mode
  The --yes flag runs runInit without prompts, composing all init
  functions with sensible defaults and CLI flag overrides.

  @fast @I9
  Scenario: Default non-interactive init creates all artifacts
    Given a temporary directory with git initialized
    And git config user.name is set to "Alice"
    When I run runInit with args "--yes"
    Then the file ".changedown/config.toml" exists in that directory
    And the file "examples/getting-started.md" exists in that directory
    And a .gitignore file exists
    And the init file ".changedown/config.toml" contains 'default = "Alice"'
    And the console output contains "ChangeDown initialized"

  @fast @I9
  Scenario: Author flag overrides identity resolution
    Given a temporary directory with git initialized
    And git config user.name is set to "Git User"
    When I run runInit with args "--yes --author=Alice"
    Then the init file ".changedown/config.toml" contains 'default = "Alice"'

  @fast @I9
  Scenario: Policy flag sets policy mode
    Given a temporary directory with git initialized
    And git config user.name is set to "Bob"
    When I run runInit with args "--yes --policy=strict"
    Then the init file ".changedown/config.toml" contains 'mode = "strict"'

  @fast @I9
  Scenario: Agents flag filters agent configuration
    Given a temporary directory with git initialized
    And git config user.name is set to "Carol"
    When I run runInit with args "--yes --agents=claude"
    Then the file ".changedown/config.toml" exists in that directory

  @fast @I9
  Scenario: Re-init guard prints summary and exits
    Given a temporary directory with git initialized
    And git config user.name is set to "Bob"
    And I run runInit with args "--yes"
    When I run runInit with args "--yes"
    Then the console output contains "already configured"
    And the console output contains "Bob"

  @fast @I9
  Scenario: Re-init guard bypassed with --reconfigure
    Given a temporary directory with git initialized
    And git config user.name is set to "Bob"
    And I run runInit with args "--yes --author=Bob"
    When I run runInit with args "--yes --reconfigure --author=NewBob"
    Then the init file ".changedown/config.toml" contains 'default = "NewBob"'

  @fast @I9
  Scenario: Gitignore appended when .gitignore exists
    Given a temporary directory with git initialized
    And git config user.name is set to "Dana"
    And the file ".gitignore" already exists with content "node_modules/"
    When I run runInit with args "--yes"
    Then the init file ".gitignore" contains "node_modules/"
    And the init file ".gitignore" contains ".changedown/"

  @fast @I9
  Scenario: Gitignore created when none exists
    Given a temporary directory with git initialized
    And git config user.name is set to "Eve"
    When I run runInit with args "--yes"
    Then a .gitignore file exists
    And the init file ".gitignore" contains ".changedown/"
