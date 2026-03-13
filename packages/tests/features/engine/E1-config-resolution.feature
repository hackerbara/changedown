Feature: E1 - Config Resolution
  Config loading from .changetracks/config.toml with defaults, overrides, and merging.

  Background:
    Given a fresh ScenarioContext

  Scenario: Default config when no config.toml exists
    When I load config from an empty directory
    Then the config tracking.include equals JSON ["**/*.md"]
    And the config tracking.exclude contains "node_modules/**"
    And the config tracking.exclude contains "dist/**"
    And the config tracking.default is "tracked"
    And the config tracking.auto_header is true
    And the config author.default is ""
    And the config author.enforcement is "optional"
    And the config hooks.enforcement is "warn"
    And the config matching.mode is "normalized"
    And the config hashline.enabled is false

  Scenario: Project config overrides defaults
    Given a config.toml with:
      """
      [tracking]
      include = ["**/*.md", "docs/**/*.txt"]
      exclude = ["node_modules/**", "dist/**", ".vscode-test/**"]

      [author]
      default = "ai:claude-opus-4.6"
      """
    When I load config from the project directory
    Then the config tracking.include equals JSON ["**/*.md","docs/**/*.txt"]
    And the config tracking.exclude contains ".vscode-test/**"
    And the config author.default is "ai:claude-opus-4.6"

  Scenario: Partial config fills missing sections from defaults
    Given a config.toml with:
      """
      [author]
      default = "human:alice"
      """
    When I load config from the project directory
    Then the config tracking.include equals JSON ["**/*.md"]
    And the config tracking.default is "tracked"
    And the config author.default is "human:alice"
    And the config hooks.enforcement is "warn"
    And the config matching.mode is "normalized"

  Scenario: Config with all new fields parsed correctly
    Given a config.toml with:
      """
      [tracking]
      include = ["**/*.md"]
      exclude = ["node_modules/**"]
      default = "untracked"
      auto_header = false

      [author]
      default = "ai:claude-opus-4.6"

      [hooks]
      enforcement = "block"

      [matching]
      mode = "strict"
      """
    When I load config from the project directory
    Then the config tracking.default is "untracked"
    And the config tracking.auto_header is false
    And the config hooks.enforcement is "block"
    And the config matching.mode is "strict"

  Scenario: Hashline section parsed alongside other sections
    Given a config.toml with:
      """
      [hashline]
      enabled = true
      """
    When I load config from the project directory
    Then the config hashline.enabled is true

  Scenario: Settlement section defaults auto_on_approve to true
    When I load config from an empty directory
    Then the config settlement.auto_on_approve is true

  Scenario: Settlement section can override auto_on_approve
    Given a config.toml with:
      """
      [settlement]
      auto_on_approve = false
      """
    When I load config from the project directory
    Then the config settlement.auto_on_approve is false

  Scenario: Policy section defaults to safety-net
    Given a config.toml with:
      """
      [tracking]
      include = ["**/*.md"]
      """
    When I load config from the project directory
    Then the config policy.mode is "safety-net"

  Scenario: Policy mode derives strict from legacy hooks.enforcement = block
    Given a config.toml with:
      """
      [hooks]
      enforcement = "block"
      """
    When I load config from the project directory
    Then the config policy.mode is "strict"

  Scenario: Explicit policy.mode takes precedence over hooks.enforcement
    Given a config.toml with:
      """
      [policy]
      mode = "permissive"

      [hooks]
      enforcement = "block"
      """
    When I load config from the project directory
    Then the config policy.mode is "permissive"

  Scenario: Invalid policy.mode falls back to safety-net
    Given a config.toml with:
      """
      [policy]
      mode = "garbage"
      """
    When I load config from the project directory
    Then the config policy.mode is "safety-net"

  Scenario: Default view and view policy defaults
    Given a config.toml with:
      """
      [policy]
      mode = "strict"
      """
    When I load config from the project directory
    Then the config policy.default_view is "review"
    And the config policy.view_policy is "suggest"
