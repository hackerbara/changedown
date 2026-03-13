@core @committed-text
Feature: C21 - Committed Text View
  The committed-text module computes a "committed view" of CriticMarkup documents.
  Per-line: accepted changes are applied, pending/unknown changes are reverted,
  rejected changes are reverted (no flag), highlights show content, comments removed.
  Document-level: parses footnotes, excludes footnote definitions, computes hashes,
  builds bidirectional line mapping, and formats output with headers and flags.

  Background:
    Given the committed-text hashline module is initialized

  # ── computeCommittedLine: basic types ──────────────────────────────

  Scenario: Plain text passes through unchanged
    Given a committed-text input "Hello world"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "Hello world"
    And the committed flag is ""
    And the committed changeIds are empty

  Scenario: Pending insertion is removed, line gets P flag
    Given a committed-text input "Before {++added text++}[^ct-1] after"
    And footnote status "ct-1" is "proposed" type "ins"
    When I compute the committed line
    Then the committed text is "Before  after"
    And the committed flag is "P"
    And the committed changeIds include "ct-1"

  Scenario: Accepted insertion text is kept, delimiters removed, A flag
    Given a committed-text input "Before {++added text++}[^ct-1] after"
    And footnote status "ct-1" is "accepted" type "ins"
    When I compute the committed line
    Then the committed text is "Before added text after"
    And the committed flag is "A"
    And the committed changeIds include "ct-1"

  Scenario: Pending deletion keeps text (revert), P flag
    Given a committed-text input "Before {--removed--}[^ct-2] after"
    And footnote status "ct-2" is "proposed" type "del"
    When I compute the committed line
    Then the committed text is "Before removed after"
    And the committed flag is "P"
    And the committed changeIds include "ct-2"

  Scenario: Accepted deletion removes text, A flag
    Given a committed-text input "Before {--removed--}[^ct-2] after"
    And footnote status "ct-2" is "accepted" type "del"
    When I compute the committed line
    Then the committed text is "Before  after"
    And the committed flag is "A"
    And the committed changeIds include "ct-2"

  Scenario: Pending substitution shows old text, P flag
    Given a committed-text input "Before {~~old~>new~~}[^ct-3] after"
    And footnote status "ct-3" is "proposed" type "sub"
    When I compute the committed line
    Then the committed text is "Before old after"
    And the committed flag is "P"
    And the committed changeIds include "ct-3"

  Scenario: Accepted substitution shows new text, A flag
    Given a committed-text input "Before {~~old~>new~~}[^ct-3] after"
    And footnote status "ct-3" is "accepted" type "sub"
    When I compute the committed line
    Then the committed text is "Before new after"
    And the committed flag is "A"
    And the committed changeIds include "ct-3"

  Scenario: Highlight shows content, no flag
    Given a committed-text input "Before {==highlighted==}[^ct-4] after"
    And footnote status "ct-4" is "proposed" type "highlight"
    When I compute the committed line
    Then the committed text is "Before highlighted after"
    And the committed flag is ""
    And the committed changeIds are empty

  Scenario: Comment is removed entirely
    Given a committed-text input "Text {>>this is a comment<<} more"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "Text  more"
    And the committed flag is ""

  # ── computeCommittedLine: edge cases ───────────────────────────────

  Scenario: P flag takes priority when line has mixed proposed and accepted
    Given a committed-text input "{++added++}[^ct-1] middle {--deleted--}[^ct-2]"
    And footnote status "ct-1" is "accepted" type "ins"
    And footnote status "ct-2" is "proposed" type "del"
    When I compute the committed line
    Then the committed text is "added middle deleted"
    And the committed flag is "P"
    And the committed changeIds include "ct-1"
    And the committed changeIds include "ct-2"

  Scenario: Rejected insertion is removed, no flag
    Given a committed-text input "Before {++nope++}[^ct-5] after"
    And footnote status "ct-5" is "rejected" type "ins"
    When I compute the committed line
    Then the committed text is "Before  after"
    And the committed flag is ""
    And the committed changeIds include "ct-5"

  Scenario: Unknown change ID is treated as proposed (P flag)
    Given a committed-text input "Before {++mystery++}[^ct-99] after"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "Before  after"
    And the committed flag is "P"
    And the committed changeIds include "ct-99"

  Scenario: Bare CriticMarkup without footnote ref is treated as proposed
    Given a committed-text input "Before {++bare insertion++} after"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "Before  after"
    And the committed flag is "P"
    And the committed changeIds are empty

  Scenario: Rejected substitution shows old text (revert)
    Given a committed-text input "{~~old~>new~~}[^ct-6]"
    And footnote status "ct-6" is "rejected" type "sub"
    When I compute the committed line
    Then the committed text is "old"
    And the committed flag is ""
    And the committed changeIds include "ct-6"

  Scenario: Rejected deletion keeps text
    Given a committed-text input "{--kept--}[^ct-7]"
    And footnote status "ct-7" is "rejected" type "del"
    When I compute the committed line
    Then the committed text is "kept"
    And the committed flag is ""
    And the committed changeIds include "ct-7"

  Scenario: Standalone footnote refs are removed
    Given a committed-text input "text [^ct-1] more"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "text  more"

  Scenario: Dotted IDs (ct-N.M) are handled correctly
    Given a committed-text input "Before {--cut--}[^ct-5.1] after"
    And footnote status "ct-5.1" is "accepted" type "del"
    When I compute the committed line
    Then the committed text is "Before  after"
    And the committed flag is "A"
    And the committed changeIds include "ct-5.1"

  Scenario: Highlight with attached comment
    Given a committed-text input "{==important==}{>>note<<}[^ct-8]"
    And footnote status "ct-8" is "proposed" type "highlight"
    When I compute the committed line
    Then the committed text is "important"
    And the committed flag is ""

  Scenario: Bare substitution without ref treated as proposed
    Given a committed-text input "Before {~~old~>new~~} after"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "Before old after"
    And the committed flag is "P"
    And the committed changeIds are empty

  Scenario: Bare deletion without ref treated as proposed (keeps text)
    Given a committed-text input "Before {--removed--} after"
    And no footnote statuses
    When I compute the committed line
    Then the committed text is "Before removed after"
    And the committed flag is "P"
    And the committed changeIds are empty

  # ── computeCommittedView: document-level ───────────────────────────

  Scenario: Sequential line numbers with no gaps when pending insertion removed
    Given a committed-view raw text:
      """
      # Title
      {++This line is pending++}[^ct-1]
      Clean line.

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    When I compute the committed view
    Then the committed view has 3 lines
    And committed view line numbers are sequential with no gaps

  Scenario: Correct committed-to-raw line mapping
    Given a committed-view raw text:
      """
      # Title
      {++pending insertion++}[^ct-1]
      Clean line.

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    When I compute the committed view
    Then committed-to-raw mapping 1 is raw 1
    And committed-to-raw mapping 2 is raw 3
    And committed-to-raw mapping 3 is raw 4
    And raw-to-committed mapping 1 is committed 1
    And raw-to-committed mapping 3 is committed 2
    And raw-to-committed mapping 4 is committed 3

  Scenario: Committed hashes are 2-char lowercase hex
    Given a committed-view raw text "# Title\nSome content\nAnother line"
    When I compute the committed view
    Then all committed hashes are 2-char lowercase hex

  Scenario: Correct summary counts
    Given a committed-view raw text:
      """
      # Title
      {++new text++}[^ct-1]
      {--old text--}[^ct-2]
      Clean line.

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      [^ct-2]: @alice | 2026-02-17 | del | accepted
      """
    When I compute the committed view
    Then the committed summary has 1 proposed
    And the committed summary has 1 accepted
    And the committed summary has 0 rejected

  Scenario: Footnote definitions excluded from committed output
    Given a committed-view raw text:
      """
      # Title
      Some text {++added++}[^ct-1]

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
          reason: clarity improvement
      """
    When I compute the committed view
    Then no committed view line starts with a footnote ref
    And no committed view line contains "reason: clarity improvement"

  Scenario: Clean file produces identical view
    Given a committed-view raw text "# Title\nFirst line.\nSecond line.\n"
    When I compute the committed view
    Then the committed view line count equals the raw line count
    And all committed view lines have empty flag
    And all committed view lines have empty changeIds
    And the committed summary has 0 proposed
    And the committed summary has 0 accepted
    And the committed summary has 0 rejected

  Scenario: Hashes match computeLineHash for committed text
    Given a committed-view raw text "# Title\nSome content here\nThird line"
    When I compute the committed view
    Then each committed hash matches computeLineHash for its text and index

  Scenario: P flag set for lines with proposed changes
    Given a committed-view raw text:
      """
      Before {++added++}[^ct-1] after

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    When I compute the committed view
    Then committed view line 1 has flag "P"
    And committed view line 1 changeIds include "ct-1"

  Scenario: A flag set for lines with accepted changes
    Given a committed-view raw text:
      """
      Before {++added++}[^ct-1] after

      [^ct-1]: @alice | 2026-02-17 | ins | accepted
      """
    When I compute the committed view
    Then committed view line 1 has flag "A"
    And committed view line 1 has text "Before added after"

  Scenario: Clean lines counted in summary
    Given a committed-view raw text "# Title\nClean line one.\nClean line two."
    When I compute the committed view
    Then the committed summary has 3 clean lines
    And the committed summary has 0 proposed

  # ── formatCommittedOutput ──────────────────────────────────────────

  Scenario: Formatted output includes header and aligned lines
    Given a committed-view raw text "# Title\nClean line."
    When I compute the committed view
    And I format the committed output for "test.md" with tracking "tracked"
    Then the formatted committed output line 1 is "## file: test.md"
    And the formatted committed output line 2 starts with "## view: committed"
    And the formatted committed output has 2 hashline content lines

  Scenario: Formatted output includes change summary
    Given a committed-view raw text:
      """
      Before {++added++}[^ct-1] after
      Clean line.

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    When I compute the committed view
    And I format the committed output for "test.md" with tracking "tracked"
    Then the formatted committed output contains "1P"

  Scenario: Formatted output shows P flag on proposed change lines
    Given a committed-view raw text:
      """
      Before {~~old~>new~~}[^ct-1] after

      [^ct-1]: @alice | 2026-02-17 | sub | proposed
      """
    When I compute the committed view
    And I format the committed output for "test.md" with tracking "tracked"
    Then the formatted committed output has a line containing "Before old after" with flag "P"

  Scenario: Formatted output shows A flag on accepted change lines
    Given a committed-view raw text:
      """
      Before {++added++}[^ct-1] after

      [^ct-1]: @alice | 2026-02-17 | ins | accepted
      """
    When I compute the committed view
    And I format the committed output for "test.md" with tracking "tracked"
    Then the formatted committed output has a line containing "Before added after" with flag "A"
