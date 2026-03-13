Feature: E3 - Author Identity
  Author resolution with optional/required enforcement and format validation.

  Scenario: Optional enforcement with explicit author uses explicit
    Given the config has author.enforcement = "optional"
    When I resolve author "ai:gemini-2.5" for tool "propose_change"
    Then the resolved author is "ai:gemini-2.5"
    And there is no author error

  Scenario: Optional enforcement without author falls back to config default
    Given the config has author.enforcement = "optional"
    And the config has author.default = "ai:claude-opus-4.6"
    When I resolve author without explicit value for tool "propose_change"
    Then the resolved author is "ai:claude-opus-4.6"
    And there is no author error

  Scenario: Optional enforcement without author and empty default falls back to unknown
    Given the config has author.enforcement = "optional"
    And the config has author.default = ""
    When I resolve author without explicit value for tool "propose_change"
    Then the resolved author is "unknown"
    And there is no author error

  Scenario: Required enforcement without author returns error
    Given the config has author.enforcement = "required"
    When I resolve author without explicit value for tool "propose_change"
    Then there is an author error
    And the author error message contains "propose_change"
    And the author error message contains "author"

  Scenario: Required enforcement with explicit author succeeds
    Given the config has author.enforcement = "required"
    When I resolve author "ai:gemini-2.5" for tool "review_change"
    Then the resolved author is "ai:gemini-2.5"
    And there is no author error

  Scenario: Invalid author format rejected - no namespace separator
    Given the config has author.enforcement = "optional"
    When I resolve author "justname" for tool "propose_change"
    Then there is an author error
    And the author error message contains "Invalid author format"

  Scenario: Valid ai namespace with dots and hyphens accepted
    Given the config has author.enforcement = "required"
    When I resolve author "ai:claude-opus_4.6" for tool "propose_change"
    Then the resolved author is "ai:claude-opus_4.6"
    And there is no author error

  Scenario: Human namespace accepted
    Given the config has author.enforcement = "required"
    When I resolve author "human:alice" for tool "propose_change"
    Then the resolved author is "human:alice"
    And there is no author error

  Scenario: Namespace starting with number rejected
    Given the config has author.enforcement = "optional"
    When I resolve author "1ai:model" for tool "propose_change"
    Then there is an author error
    And the author error message contains "Invalid author format"

  Scenario: Uppercase namespace rejected
    Given the config has author.enforcement = "optional"
    When I resolve author "AI:model" for tool "propose_change"
    Then there is an author error
    And the author error message contains "Invalid author format"
