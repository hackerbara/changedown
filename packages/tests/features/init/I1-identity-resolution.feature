Feature: I1 - Identity Resolution
  Resolve user identity from available sources: git config, system username, fallback.

  Scenario: Resolves identity from git config user.name
    Given a temporary directory with git initialized
    And git config user.name is set to "Alice Smith"
    When I resolve identity in that directory
    Then the resolved identity is "Alice Smith"

  Scenario: Falls back to system username when git has no user.name
    Given a temporary directory with git initialized
    And git config user.name is not set
    When I resolve identity in that directory
    Then the resolved identity is the system username

  Scenario: Returns a non-empty identity from available sources
    Given a temporary directory without git
    When I resolve identity in that directory
    Then the resolved identity is not empty

  Scenario: Trims whitespace from git user.name
    Given a temporary directory with git initialized
    And git config user.name is set to "  Bob  "
    When I resolve identity in that directory
    Then the resolved identity is "Bob"
