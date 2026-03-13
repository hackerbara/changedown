@integration @configuration @CFG1
Feature: CFG1 -- Configuration keys and defaults
  Port of Configuration.test.ts (6 mocha tests).
  Verifies that expected VS Code configuration keys exist in package.json
  contribution points and return correct default values.

  # ── trackingMode ────────────────────────────────────────────────────

  Scenario: changetracks.trackingMode configuration exists
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changetracks.trackingMode" exists
    And configuration key "changetracks.trackingMode" has type "boolean"

  Scenario: Controller reads trackingMode on initialization
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changetracks.trackingMode" exists

  # ── Old config key must not exist ───────────────────────────────────

  Scenario: Old configuration key superExpert.trackingMode does not exist
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "superExpert.trackingMode" does not exist

  # ── scmIntegrationMode ─────────────────────────────────────────────

  Scenario: changetracks.scmIntegrationMode exists and defaults to scm-first
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changetracks.scmIntegrationMode" exists
    And configuration key "changetracks.scmIntegrationMode" has value "scm-first"

  Scenario: getScmIntegrationMode returns a valid enum value
    Given I open "tracking-mode-test.md" in VS Code
    Then scmIntegrationMode is one of "scm-first", "hybrid", "legacy"

  # ── commentsExpandedByDefault ──────────────────────────────────────

  Scenario: changetracks.commentsExpandedByDefault defaults to false
    Given I open "tracking-mode-test.md" in VS Code
    Then configuration key "changetracks.commentsExpandedByDefault" exists
    And configuration key "changetracks.commentsExpandedByDefault" has boolean value false
