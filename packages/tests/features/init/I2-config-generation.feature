Feature: I2 - Config Generation
  Generate .changetracks/config.toml from options.

  @fast @I2
  Scenario: Generate default config with author only
    When I generate config with author "Alice"
    Then the generated config contains '[tracking]'
    And the generated config contains 'include = ["**/*.md"]'
    And the generated config contains 'exclude = ["node_modules/**", "dist/**", ".git/**"]'
    And the generated config contains '[author]'
    And the generated config contains 'default = "Alice"'
    And the generated config contains 'enforcement = "optional"'
    And the generated config contains '[hashline]'
    And the generated config contains 'enabled = true'
    And the generated config contains '[settlement]'
    And the generated config contains 'auto_on_approve = true'

  @fast @I2
  Scenario: Generate config with custom tracking patterns
    When I generate config with author "Bob" and custom include patterns
      | pattern          |
      | **/*.md          |
      | docs/**/*.txt    |
    Then the generated config contains 'include = ["**/*.md", "docs/**/*.txt"]'

  @fast @I2
  Scenario: Generate config with required author enforcement
    When I generate config with author "Charlie" and enforcement "required"
    Then the generated config contains 'enforcement = "required"'

  @fast @I2
  Scenario: Generate config with custom exclude patterns
    When I generate config with author "Dana" and custom exclude patterns
      | pattern          |
      | node_modules/**  |
      | vendor/**        |
    Then the generated config contains 'exclude = ["node_modules/**", "vendor/**"]'

  @fast @I2
  Scenario: Generate config with policy mode
    When I generate config with author "testauthor" and policyMode "strict"
    Then the generated config contains "[policy]"
    And the generated config contains 'mode = "strict"'

  @fast @I2
  Scenario: Generate config with protocol settings
    When I generate config with author "testauthor" and protocolMode "compact" and reasoning "required"
    Then the generated config contains "[protocol]"
    And the generated config contains 'mode = "compact"'
    And the generated config contains 'reasoning = "required"'

  @fast @I2
  Scenario: Generate config with settlement settings
    When I generate config with author "testauthor" and autoSettleOnReject false
    Then the generated config contains "[settlement]"
    And the generated config contains "auto_on_reject = false"

  @fast @I2
  Scenario: Generate config with all defaults produces full config
    When I generate config with author "testauthor"
    Then the generated config contains "[tracking]"
    And the generated config contains "[author]"
    And the generated config contains "[hashline]"
    And the generated config contains "[settlement]"
    And the generated config contains "[policy]"
    And the generated config contains "[protocol]"
