Feature: E2 - Scope Tracking
  Three-layer tracking status resolution: file header > project config > global default.

  Scenario: File with tracking header is tracked
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- ctrcks.com/v1: tracked -->
      # Hello
      Some content.
      """
    When I resolve tracking status for "doc.md"
    Then the tracking status is "tracked"
    And the tracking source is "file_header"
    And the tracking header_present is true

  Scenario: File with untracked header is untracked
    Given a tracked markdown file "doc.md" with content:
      """
      <!-- ctrcks.com/v1: untracked -->
      # Hello
      Some content.
      """
    When I resolve tracking status for "doc.md"
    Then the tracking status is "untracked"
    And the tracking source is "file_header"

  Scenario: File without header and default tracked is tracked via project config
    Given the config has tracking.default = "tracked"
    And a tracked markdown file "doc.md" with content:
      """
      # Just a regular markdown file
      """
    When I resolve tracking status for "doc.md"
    Then the tracking status is "tracked"
    And the tracking source is "project_config"
    And the tracking header_present is false

  Scenario: File without header and default untracked is untracked via project config
    Given the config has tracking.default = "untracked"
    And a tracked markdown file "doc.md" with content:
      """
      # A markdown file
      """
    When I resolve tracking status for "doc.md"
    Then the tracking status is "untracked"
    And the tracking source is "project_config"

  Scenario: File header overrides project config default untracked
    Given the config has tracking.default = "untracked"
    And a tracked markdown file "doc.md" with content:
      """
      <!-- ctrcks.com/v1: tracked -->
      # Hello
      """
    When I resolve tracking status for "doc.md"
    Then the tracking status is "tracked"
    And the tracking source is "file_header"

  Scenario: Out-of-scope file type is untracked via global default
    Given a tracked markdown file "image.png" with content:
      """
      binary content
      """
    When I resolve tracking status for "image.png"
    Then the tracking status is "untracked"
    And the tracking source is "global_default"

  Scenario: File with header after YAML frontmatter is detected
    Given a tracked markdown file "doc.md" with content:
      """
      ---
      title: My Doc
      ---
      <!-- ctrcks.com/v1: tracked -->
      # Content
      """
    When I resolve tracking status for "doc.md"
    Then the tracking status is "tracked"
    And the tracking source is "file_header"
    And the tracking header_present is true
