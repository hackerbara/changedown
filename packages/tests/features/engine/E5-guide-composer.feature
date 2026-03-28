Feature: E5 - Guide Composer
  First-contact guide generation and session-level delivery control.

  Scenario: First read includes the edit guide when guide is enabled
    Given the config has protocol.mode = "classic"
    And guide delivery is enabled
    And a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    Then the response has 2 content items total
    And the first content item contains "How to edit this file"

  Scenario: Second read omits the edit guide
    Given the config has protocol.mode = "classic"
    And guide delivery is enabled
    And a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    And I call read_tracked_file for "doc.md" with view = "review"
    Then the response has 1 content items total

  Scenario: Classic mode guide includes old_text/new_text
    Given the config has protocol.mode = "classic"
    And guide delivery is enabled
    And a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    Then the first content item contains "old_text"
    And the first content item contains "new_text"

  Scenario: Compact mode guide includes at/op and LINE:HASH
    Given the config has protocol.mode = "compact"
    And guide delivery is enabled
    And a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    Then the first content item contains "LINE:HASH"
    And the first content item contains "old~>new"

  Scenario: Guide includes chaining advice about affected_lines
    Given the config has protocol.mode = "classic"
    And guide delivery is enabled
    And a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    Then the first content item contains "affected_lines"
