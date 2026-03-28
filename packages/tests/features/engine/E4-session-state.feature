Feature: E4 - Session State
  Session state manages per-file ID counters, view tracking, and staleness detection.

  Scenario: Read records last view for the file
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content here.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    Then the session records lastReadView "review" for "doc.md"

  Scenario: Different view names are recorded correctly
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Some content here.
      """
    When I call read_tracked_file for "doc.md" with view = "settled"
    Then the session records lastReadView "settled" for "doc.md"

  Scenario: Content fingerprint updated after propose write
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      Original text here.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    And I call propose_change with:
      | file       | doc.md           |
      | old_text   | Original         |
      | new_text   | Updated          |
      | reasoning  | testing          |
    Then the session is not stale for "doc.md"

  Scenario: ID counter increments across multiple proposals
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      First line.
      Second line.
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    And I call propose_change with:
      | file       | doc.md       |
      | old_text   | First        |
      | new_text   | FIRST        |
      | reasoning  | caps         |
    Then the response contains change_id "cn-1"
    When I call propose_change with:
      | file       | doc.md       |
      | old_text   | Second       |
      | new_text   | SECOND       |
      | reasoning  | caps         |
    Then the response contains change_id "cn-2"

  Scenario: Session teardown cleans up temporary files
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- changedown.com/v1: tracked -->
      # Test
      """
    When I call read_tracked_file for "doc.md" with view = "review"
    Then the session teardown completes without error
