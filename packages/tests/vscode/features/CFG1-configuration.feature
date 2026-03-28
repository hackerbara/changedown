@integration @configuration @CFG1
Feature: CFG1 -- Configuration keys and defaults
  Port of Configuration.test.ts (6 mocha tests).
  Verifies that expected VS Code configuration keys exist in package.json
  contribution points and return correct default values.

  # ── trackingMode ────────────────────────────────────────────────────

  Scenario: changedown.trackingMode configuration exists
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changedown.trackingMode" exists
    And configuration key "changedown.trackingMode" has type "boolean"

  Scenario: Controller reads trackingMode on initialization
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changedown.trackingMode" exists

  # ── Old config key must not exist ───────────────────────────────────

  Scenario: Old configuration key superExpert.trackingMode does not exist
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "superExpert.trackingMode" does not exist

  # ── scmIntegrationMode ─────────────────────────────────────────────

  Scenario: changedown.scmIntegrationMode exists and defaults to scm-first
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changedown.scmIntegrationMode" exists
    And configuration key "changedown.scmIntegrationMode" has value "scm-first"

  Scenario: getScmIntegrationMode returns a valid enum value
    Given I open "tracking-mode-test.md" in VS Code
    Then scmIntegrationMode is one of "scm-first", "hybrid", "legacy"

  # ── clickToShowComments ──────────────────────────────────────

  Scenario: changedown.clickToShowComments defaults to true
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changedown.clickToShowComments" exists
    And configuration key "changedown.clickToShowComments" has boolean value true
