@core @hashline-tracked
Feature: C25 — Hashline Tracked Utilities
  The hashline-tracked module provides CriticMarkup-aware line hashing and
  formatting. settledLine strips CriticMarkup using accept-all semantics.
  computeSettledLineHash hashes the settled content. formatTrackedHashLines
  formats file content with hashline coordinates. formatTrackedHeader
  generates the header block for read_tracked_file output.

  # ===== settledLine =====

  Scenario: Plain text passes through unchanged
    Given the settled line input is "Hello world"
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Strips insertion delimiters, keeps content
    Given the settled line input is:
      """
      Hello {++world++}
      """
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Strips deletion entirely
    Given the settled line input is:
      """
      Hello {--cruel --}world
      """
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Substitution resolves to new text
    Given the settled line input is:
      """
      Hello {~~earth~>world~~}
      """
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Highlight stripped, content kept
    Given the settled line input is:
      """
      Hello {==world==}
      """
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Comment stripped entirely
    Given the settled line input is:
      """
      Hello world{>>this is a comment<<}
      """
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Footnote references stripped
    Given the settled line input is:
      """
      Hello world[^cn-1]
      """
    When I compute the settled line output
    Then the settled line output is "Hello world"

  Scenario: Multiple markup types on one line
    Given the settled line input is:
      """
      The {++quick ++}{--slow --}{~~brown~>red~~} fox[^cn-1]{>>nice<<}
      """
    When I compute the settled line output
    Then the settled line output is "The quick red fox"

  Scenario: Substitution and insertion together on one line
    Given the settled line input is:
      """
      {~~old~>new~~} text {++added++}
      """
    When I compute the settled line output
    Then the settled line output is "new text added"

  Scenario: Empty line returns empty
    Given the settled line input is ""
    When I compute the settled line output
    Then the settled line output is empty

  Scenario: Line with only deletion returns empty
    Given the settled line input is:
      """
      {--everything removed--}
      """
    When I compute the settled line output
    Then the settled line output is empty

  Scenario: Preserves non-markup content around changes
    Given the settled line input is:
      """
      prefix {++inserted++} middle {--deleted--} suffix
      """
    When I compute the settled line output
    Then the settled line output is "prefix inserted middle  suffix"

  # ===== computeSettledLineHash =====

  @C25
  Scenario: Returns 2-character hex string
    Given the hashline module is ready
    When I compute the settled hash at index 0 for "Hello world"
    Then the settled hash is a valid 2-char hex string

  @C25
  Scenario: Different content produces different hashes
    Given the hashline module is ready
    When I compute the settled hash at index 0 for "hello"
    And I store the settled hash as "hash1"
    And I compute the settled hash at index 0 for "goodbye"
    Then the settled hash differs from stored "hash1"

  @C25
  Scenario: Same content at different indices produces same hash
    Given the hashline module is ready
    When I compute the settled hash at index 0 for "hello"
    And I store the settled hash as "hash1"
    And I compute the settled hash at index 5 for "hello"
    Then the settled hash equals stored "hash1"

  @C25
  Scenario: CriticMarkup is stripped before hashing
    Given the hashline module is ready
    When I compute the settled hash at index 0 for:
      """
      Hello {++world++}
      """
    And I store the settled hash as "markupHash"
    And I compute the settled hash at index 0 for "Hello world"
    Then the settled hash equals stored "markupHash"

  @C25
  Scenario: Empty line produces valid hash
    Given the hashline module is ready
    When I compute the settled hash at index 0 for ""
    Then the settled hash is a valid 2-char hex string

  # ===== formatTrackedHashLines =====

  @C25
  Scenario: Single plain line uses single hash format
    Given the hashline module is ready
    When I format tracked hash lines for "Hello world"
    Then the tracked output line 1 matches single hash format

  @C25
  Scenario: Line with CriticMarkup uses single hash format
    Given the hashline module is ready
    When I format tracked hash lines for:
      """
      Hello {++world++}
      """
    Then the tracked output line 1 matches single hash format

  @C25
  Scenario: Multi-line content with right-aligned line numbers
    Given the hashline module is ready
    When I format tracked hash lines for "line1\nline2\nline3"
    Then the tracked output has 3 lines
    And all tracked output lines have pipe delimiters

  @C25
  Scenario: Custom startLine option shifts numbering
    Given the hashline module is ready
    When I format tracked hash lines with startLine 10 for "aaa\nbbb"
    Then the tracked output line 1 starts with number 10
    And the tracked output line 2 starts with number 11

  @C25
  Scenario: CriticMarkup line always uses single hash
    Given the hashline module is ready
    When I format tracked hash lines for:
      """
      Hello {++world++}
      """
    Then the tracked output line 1 matches single hash format

  @C25
  Scenario: Empty content returns single hashline for the empty line
    Given the hashline module is ready
    When I format tracked hash lines for ""
    Then the tracked output has 1 lines

  @C25
  Scenario: Mixed markup and plain lines
    Given the hashline module is ready
    When I format tracked hash lines for:
      """
      Plain text here
      Some {++inserted++} text
      Another plain line
      """
    Then the tracked output has 3 lines
    And tracked output line 1 matches single hash format
    And tracked output line 2 matches single hash format
    And tracked output line 3 matches single hash format

  @C25
  Scenario: Pipe delimiter separates hash from content
    Given the hashline module is ready
    When I format tracked hash lines for "test content"
    Then the tracked output line 1 contains "|test content"

  @C25
  Scenario: Line numbers pad to max width
    Given the hashline module is ready
    When I format tracked hash lines for "a\nb\nc\nd\ne\nf\ng\nh\ni\nj"
    Then the tracked output line 1 starts with a space-padded number

  @C25
  Scenario: Large content pads line numbers correctly
    Given the hashline module is ready
    When I format tracked hash lines for "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12"
    Then the tracked output has 12 lines
    And the tracked output line 1 starts with a space-padded number

  # ===== formatTrackedHeader =====

  @C25
  Scenario: Header contains file path
    Given the hashline module is ready
    When I format tracked header for file "docs/example.md" with content "Hello world"
    Then the tracked header contains "## file: docs/example.md"

  @C25
  Scenario: Header contains tracking status
    Given the hashline module is ready
    When I format tracked header for file "test.md" with status "tracked" and content "Hello"
    Then the tracked header contains "## tracking: tracked"

  @C25
  Scenario: Header counts proposed changes
    Given the hashline module is ready
    When I format tracked header for file "test.md" with content:
      """
      Hello {++world++} text
      """
    Then the tracked header contains "1 proposed"

  @C25
  Scenario: Header counts accepted changes from footnotes
    Given the hashline module is ready
    When I format tracked header for file "test.md" with content:
      """
      Hello {++world++}[^cn-1] text

      [^cn-1]: @alice | 2026-02-10 | ins | accepted
      """
    Then the tracked header contains "1 accepted"

  @C25
  Scenario: Header counts rejected changes from footnotes
    Given the hashline module is ready
    When I format tracked header for file "test.md" with content:
      """
      Hello {--world--}[^cn-1] text

      [^cn-1]: @alice | 2026-02-10 | del | rejected
      """
    Then the tracked header contains "1 rejected"

  @C25
  Scenario: Header shows line count
    Given the hashline module is ready
    When I format tracked header for file "test.md" with content "line1\nline2\nline3"
    Then the tracked header contains "## lines: 1-3 of 3"

  @C25
  Scenario: Header includes hashline tip
    Given the hashline module is ready
    When I format tracked header for file "test.md" with content "Hello"
    Then the tracked header contains "LINE:HASH"

  @C25
  Scenario: No CriticMarkup produces zero counts
    Given the hashline module is ready
    When I format tracked header for file "test.md" with content "Just plain text\nNo markup here"
    Then the tracked header does not contain "proposed"
    And the tracked header does not contain "accepted"
    And the tracked header does not contain "rejected"
