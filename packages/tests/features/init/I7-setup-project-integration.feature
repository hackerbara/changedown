Feature: I7 — Setup project integration
  The setupProject command composes identity resolution, config generation,
  example copying, and gitignore handling into a single flow. These tests
  verify the integration of all init modules working together.

  @fast @I7
  Scenario: Full setup flow creates all expected artifacts
    Given a temporary directory with git initialized
    And git config user.name is set to "Alice"
    When I run the setupProject flow in that directory
    Then the file ".changetracks/config.toml" exists in that directory
    And the file "examples/getting-started.md" exists in that directory
    And the file ".gitignore" exists in that directory
    And the init file ".changetracks/config.toml" contains 'default = "Alice"'
    And the init file ".changetracks/config.toml" contains "[policy]"
    And the init file ".changetracks/config.toml" contains "[protocol]"
    And the init file ".changetracks/config.toml" contains "[settlement]"
    And the init file ".changetracks/config.toml" contains "[hashline]"
    And the init file ".changetracks/config.toml" contains "reasoning"

  @fast @I7
  Scenario: Setup flow with pre-existing .gitignore appends entries
    Given a temporary directory with git initialized
    And git config user.name is set to "Bob"
    And the file ".gitignore" already exists with content "node_modules/"
    When I run the setupProject flow in that directory
    Then the init file ".gitignore" contains "node_modules/"
    And the init file ".gitignore" contains ".changetracks/pending.json"

  @fast @I7
  Scenario: Setup flow without git falls back to system username
    Given a temporary directory without git
    When I run the setupProject flow in that directory
    Then the file ".changetracks/config.toml" exists in that directory
    And the file "examples/getting-started.md" exists in that directory

  @fast @I7
  Scenario: Setup flow does not overwrite existing examples
    Given a temporary directory with git initialized
    And git config user.name is set to "Charlie"
    And the file "examples/getting-started.md" already exists with content "My custom content"
    When I run the setupProject flow in that directory
    Then the init file "examples/getting-started.md" contains "My custom content"

  @fast @I7
  Scenario: Config includes all six TOML sections
    Given a temporary directory with git initialized
    And git config user.name is set to "Dana"
    When I run the setupProject flow in that directory
    Then the init file ".changetracks/config.toml" contains "[tracking]"
    And the init file ".changetracks/config.toml" contains "[author]"
    And the init file ".changetracks/config.toml" contains "[hashline]"
    And the init file ".changetracks/config.toml" contains "[settlement]"
    And the init file ".changetracks/config.toml" contains "[policy]"
    And the init file ".changetracks/config.toml" contains "[protocol]"
