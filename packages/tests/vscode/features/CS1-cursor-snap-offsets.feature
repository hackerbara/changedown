@fast @CS1
Feature: CS1 -- Cursor snap hidden offset computation
  Verify that the decorator exposes correct hidden offset ranges
  and that the binary search correctly identifies containing ranges.

  # ── Binary search: findContainingHiddenRange ──

  Scenario: Empty ranges returns undefined
    Given hidden offset ranges []
    When I search for offset 5
    Then the search result is undefined

  Scenario: Offset before single range
    Given hidden offset ranges "[{\"start\": 10, \"end\": 15}]"
    When I search for offset 5
    Then the search result is undefined

  Scenario: Offset at range start (inside, half-open)
    Given hidden offset ranges "[{\"start\": 10, \"end\": 15}]"
    When I search for offset 10
    Then the search result is 10 to 15

  Scenario: Offset inside range
    Given hidden offset ranges "[{\"start\": 10, \"end\": 15}]"
    When I search for offset 12
    Then the search result is 10 to 15

  Scenario: Offset at range end (outside, half-open)
    Given hidden offset ranges "[{\"start\": 10, \"end\": 15}]"
    When I search for offset 15
    Then the search result is undefined

  Scenario: Offset after range
    Given hidden offset ranges "[{\"start\": 10, \"end\": 15}]"
    When I search for offset 20
    Then the search result is undefined

  Scenario: Multiple ranges - finds correct one
    Given hidden offset ranges "[{\"start\": 5, \"end\": 8}, {\"start\": 15, \"end\": 20}, {\"start\": 30, \"end\": 35}]"
    When I search for offset 17
    Then the search result is 15 to 20

  Scenario: Multiple ranges - between ranges
    Given hidden offset ranges "[{\"start\": 5, \"end\": 8}, {\"start\": 15, \"end\": 20}]"
    When I search for offset 10
    Then the search result is undefined

  Scenario: Adjacent ranges - boundary precision
    Given hidden offset ranges "[{\"start\": 5, \"end\": 10}, {\"start\": 10, \"end\": 15}]"
    When I search for offset 10
    Then the search result is 10 to 15

  # ── Decorator hidden offset integration ──

  Scenario: Insertion in smart view - hidden offsets match delimiter positions
    Given markup text "Hello {++world++} end"
    When I decorate in smart view mode
    Then hidden offset count is 2
    And hidden offset 0 is 6 to 9
    And hidden offset 1 is 14 to 17

  Scenario: Deletion in smart view - entire change is hidden
    Given markup text "Hello {--world--} end"
    When I decorate in smart view mode
    Then hidden offset count is 1
    And hidden offset 0 is 6 to 17

  Scenario: No hidden offsets in markup mode with showDelimiters on
    Given markup text "Hello {++world++} end"
    When I decorate in markup mode
    Then hidden offset count is 0

  Scenario: Substitution in final mode - opening, original+separator, and closing hidden
    Given markup text "Hello {~~old~>new~~} end"
    When I decorate in final mode
    Then hidden offset count is 3
    And hidden offset 0 is 6 to 9
    And hidden offset 1 is 9 to 14
    And hidden offset 2 is 17 to 20
