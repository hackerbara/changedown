Feature: H2 - Batch Wrapper
  The batch wrapper reads pending edits recorded during an agent session,
  groups them by file, allocates SC-IDs, applies CriticMarkup wrapping,
  and appends footnotes. It is the "log-then-batch" engine.

  Background:
    Given a temporary project directory

  # ── Single Edit Wrapping ──

  Scenario: Single substitution is wrapped with CriticMarkup and footnote
    Given a file "readme.md" with content "# Updated heading\n\nSome content.\n"
    And a pending substitution from "# Original heading" to "# Updated heading" in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "{~~# Original heading~># Updated heading~~}"
    And the batch file "readme.md" includes "[^ct-1]"
    And the batch file "readme.md" includes "| sub | proposed"
    And the batch result applied 1 edit
    And the batch result change IDs include "ct-1"

  Scenario: Pure insertion is wrapped with {++...++}
    Given a file "readme.md" with content "# Hello\n\nNew paragraph here.\n\nOld paragraph.\n"
    And a pending insertion of "New paragraph here.\n\n" in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "{++New paragraph here."
    And the batch file "readme.md" includes "| ins | proposed"

  Scenario: Deletion is wrapped with {--...--}
    Given a file "readme.md" with content "Before text. After text."
    And a pending deletion of "Removed text. " with context "Before text. " and "After text." in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "{--Removed text. --}"
    And the batch file "readme.md" includes "| del | proposed"

  # ── Grouped IDs (Batch) ──

  Scenario: Multiple edits in one session use dotted IDs
    Given a file "readme.md" with content "# New Title\n\nNew paragraph.\n"
    And a pending substitution from "# Old Title" to "# New Title" in session "ses_1"
    And a pending substitution from "Old paragraph." to "New paragraph." in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "[^ct-1.1]"
    And the batch file "readme.md" includes "[^ct-1.2]"
    And the batch file "readme.md" includes "| group | proposed"
    And the batch result applied 2 edits

  Scenario: Single edit does not generate a parent group footnote
    Given a file "readme.md" with content "Updated text here.\n"
    And a pending substitution from "Original text here." to "Updated text here." in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" excludes "| group | proposed"
    And the batch file "readme.md" includes "| sub | proposed"

  # ── ID Continuation ──

  Scenario: New IDs increment from the max existing ID in the file
    Given a file "readme.md" with content "# New heading\n\nSome {++inserted++}[^ct-3] text.\n\n[^ct-3]: @someone | 2026-02-09 | ins | proposed\n"
    And a pending substitution from "# Old heading" to "# New heading" in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "[^ct-4]"
    And the batch file "readme.md" includes "[^ct-3]"

  # ── Session Isolation ──

  Scenario: Edits from a different session are not processed
    Given a file "readme.md" with content "Updated text"
    And a pending substitution from "Original text" to "Updated text" in session "ses_OTHER"
    When I apply pending edits for session "ses_1"
    Then the batch result applied 0 edits

  Scenario: Pending edits are cleared after processing
    Given a file "readme.md" with content "Updated text"
    And a pending substitution from "Original text" to "Updated text" in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the pending edits file is empty

  # ── Creation Tracking ──

  Scenario: Creation tracking with footnote adds header and footnote without inline wrapping
    Given a file "new-doc.md" with content "# Hello World\n\nThis is a new file.\n"
    And a pending creation of the entire file in session "ses_1"
    When I apply pending edits for session "ses_1" with creation_tracking "footnote"
    Then the batch file "new-doc.md" includes "<!-- ctrcks.com/v1: tracked -->"
    And the batch file "new-doc.md" includes "| creation | proposed"
    And the batch file "new-doc.md" excludes "{++"

  Scenario: Creation tracking with none leaves file untouched
    Given a file "new-doc.md" with content "# Untouched\n\nContent here.\n"
    And a pending creation of the entire file in session "ses_1"
    When I apply pending edits for session "ses_1" with creation_tracking "none"
    Then the batch file "new-doc.md" has unchanged content

  # ── Reverse-Order Processing ──

  Scenario: Reverse-order processing preserves document integrity
    Given a file "readme.md" with content "First change here.\n\nSecond change here.\n"
    And a pending substitution from "first original" to "First change" with context "" and " here." in session "ses_1"
    And a pending substitution from "second original" to "Second change" with context "\n\n" and " here." in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "{~~first original~>First change~~}[^ct-1.1]"
    And the batch file "readme.md" includes "{~~second original~>Second change~~}[^ct-1.2]"

  # ── Cross-File ID Scanning ──

  Scenario: Cross-file ID scanning avoids collisions
    Given a file "a.md" with content "Change in A.\n\n[^ct-5]: @someone | 2026-02-09 | ins | proposed\n"
    And a file "b.md" with content "Change in B.\n\n[^ct-3]: @someone | 2026-02-09 | ins | proposed\n"
    And a pending substitution from "old A" to "Change in A" with context "" and "." in session "ses_1" for file "a.md"
    And a pending substitution from "old B" to "Change in B" with context "" and "." in session "ses_1" for file "b.md"
    When I apply pending edits for session "ses_1"
    Then the batch file "a.md" includes "[^ct-6.1]"
    And the batch file "b.md" includes "[^ct-6.2]"
    And the batch file "a.md" includes "| group | proposed"

  # ── Session Isolation: Other Session Preserved ──

  Scenario: Other session edits preserved during batch
    Given a file "a.md" with content "Change A"
    And a file "b.md" with content "Change B"
    And a pending substitution from "Original A" to "Change A" in session "ses_A" for file "a.md"
    And a pending substitution from "Original B" to "Change B" in session "ses_B" for file "b.md"
    When I apply pending edits for session "ses_A"
    Then the batch result applied 1 edit
    And the pending edits for session "ses_B" still exist

  # ── Footnote Spacing ──

  Scenario: Footnote spacing has no double blank lines
    Given a file "readme.md" with content "# New Title\n\nNew paragraph.\n"
    And a pending substitution from "# Old Title" to "# New Title" in session "ses_1"
    And a pending substitution from "Old paragraph." to "New paragraph." in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" has no triple newlines

  # ── Context Disambiguation ──

  Scenario: Context disambiguation wraps the correct occurrence of duplicated text
    Given a file "readme.md" with content "AAA hello world BBB\nCCC hello world DDD\n"
    And a pending insertion of "hello world" with context "CCC " and " DDD" in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch file "readme.md" includes "AAA hello world BBB"
    And the batch file "readme.md" includes "CCC {++hello world++}[^ct-1] DDD"

  # ── File Deleted Between Edit and Batch ──

  Scenario: File deleted between edit and batch is handled gracefully
    Given a pending substitution from "old" to "new" for a deleted file in session "ses_1"
    When I apply pending edits for session "ses_1"
    Then the batch result applied 1 edit

  # ── Creation Tracking: Inline Mode ──

  Scenario: Inline creation tracking wraps entire file in insertion markup
    Given a file "new-doc.md" with content "# Wrapped\n\nAll of this.\n"
    And a pending creation of the entire file in session "ses_1"
    When I apply pending edits for session "ses_1" with creation_tracking "inline"
    Then the batch file "new-doc.md" includes "{++"
    And the batch file "new-doc.md" includes "++}"

  # ── Full-File Safety Guard ──

  Scenario: Full-file safety guard reclassifies large insertion as creation
    Given a file "replaced.md" with content "# Fully Replaced\n\nEntire file was rewritten.\n"
    And a pending large insertion covering the entire file in session "ses_1"
    When I apply pending edits for session "ses_1" with creation_tracking "footnote"
    Then the batch file "replaced.md" includes "<!-- ctrcks.com/v1: tracked -->"
    And the batch file "replaced.md" includes "| creation | proposed"
    And the batch file "replaced.md" excludes "{++"

  # ── Header Preservation ──

  Scenario: Header preservation does not duplicate tracking header
    Given a file "already-tracked.md" with content "<!-- ctrcks.com/v1: tracked -->\n# Already Tracked\n\nContent.\n"
    And a pending creation of the entire file in session "ses_1"
    When I apply pending edits for session "ses_1" with creation_tracking "footnote"
    Then the batch file "already-tracked.md" has exactly 1 tracking header

  # ── CriticMarkup Corruption Detection ──

  Scenario: CriticMarkup corruption detection preserves existing markup
    Given a file "fixture.md" with content "# Test Fixture\n\nThis has an {++insertion++} in the text.\n\nThis has a {--deletion--} in the text.\n"
    And a pending creation of the entire file in session "ses_1"
    When I apply pending edits for session "ses_1" with creation_tracking "footnote"
    Then the batch file "fixture.md" includes "{++insertion++}"
    And the batch file "fixture.md" includes "{--deletion--}"
    And the batch file "fixture.md" excludes "{++# Test Fixture"
    And the batch file "fixture.md" includes "| creation | proposed"
