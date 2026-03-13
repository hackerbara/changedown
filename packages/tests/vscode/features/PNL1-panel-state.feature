@fast @panel-state @PNL1
Feature: PNL1 — ProjectStatusModel state management
  As the extension controller
  I want a ProjectStatusModel that correctly manages tracking state
  So that all surfaces reflect consistent state

  # ── Default values ─────────────────────────────────────────────────

  Scenario: Returns default values when no config file exists
    Given a fresh ProjectStatusModel
    Then tracking is enabled
    And tracking source is "default"
    And required fields list is empty
    And amend policy is "same-author"

  # ── TOML config parsing ────────────────────────────────────────────

  Scenario: Parses tracking config from TOML content
    Given a fresh ProjectStatusModel
    When I load TOML config:
      """
      [tracking]
      default = "tracked"

      [author]
      enforcement = "required"
      """
    Then tracking is enabled
    And tracking source is "project"
    And required fields list contains "author"

  # ── File-level override ────────────────────────────────────────────

  Scenario: Reflects file-level tracking override
    Given a fresh ProjectStatusModel
    And I load TOML config "[tracking]\ndefault = \"tracked\""
    When I set file tracking override to "untracked"
    Then tracking is disabled
    And tracking source is "file"

  # ── Session toggle ─────────────────────────────────────────────────

  Scenario: Session toggle overrides without changing config
    Given a fresh ProjectStatusModel
    And I load TOML config "[tracking]\ndefault = \"tracked\""
    When I set session tracking override to false
    Then tracking is disabled
    And tracking source is "session"

  # ── Change event ───────────────────────────────────────────────────

  Scenario: Fires change event when config updates
    Given a fresh ProjectStatusModel
    And I am listening for change events
    When I load TOML config "[tracking]\ndefault = \"untracked\""
    Then the change event fired

  # ── Visible fields ─────────────────────────────────────────────────

  Scenario: Visible fields are configurable
    Given a fresh ProjectStatusModel
    When I set visible fields to "tracking,required"
    Then visible fields are "tracking,required"

  # ── Panel cross-surface sync ───────────────────────────────────────

  Scenario: Session tracking override updates model status
    Given a fresh ProjectStatusModel
    And I load TOML config "[tracking]\ndefault = \"tracked\""
    When I set session tracking override to false
    Then tracking is disabled
    And tracking source is "session"

  Scenario: File tracking override resets session override
    Given a fresh ProjectStatusModel
    When I set session tracking override to false
    And I set session tracking override to null
    And I set file tracking override to "tracked"
    Then tracking source is "file"
    And tracking is enabled

  Scenario: Model fires change event for each state mutation
    Given a fresh ProjectStatusModel
    And I am counting change events
    When I set session tracking override to false
    And I set file tracking override to "untracked"
    Then the change event fired 2 times

  Scenario: Session override takes precedence over file override
    Given a fresh ProjectStatusModel
    And I load TOML config "[tracking]\ndefault = \"tracked\""
    When I set file tracking override to "untracked"
    And I set session tracking override to true
    Then tracking is enabled
    And tracking source is "session"

  Scenario: Clearing session override falls back to file override
    Given a fresh ProjectStatusModel
    And I load TOML config "[tracking]\ndefault = \"tracked\""
    When I set file tracking override to "untracked"
    And I set session tracking override to true
    And I set session tracking override to null
    Then tracking is disabled
    And tracking source is "file"

  Scenario: Clearing both overrides falls back to project config
    Given a fresh ProjectStatusModel
    And I load TOML config "[tracking]\ndefault = \"untracked\""
    When I set file tracking override to "tracked"
    And I set session tracking override to false
    And I set session tracking override to null
    And I set file tracking override to null
    Then tracking is disabled
    And tracking source is "project"
