Feature: C8 - Footnote Parsing
  The footnote parser extracts metadata from `[^ct-N]: @author | date | type | status`
  header lines and their indented continuation lines. It returns a Map of FootnoteInfo
  records keyed by footnote ID.

  Background:
    Given the footnote parser is initialized

  # --- Basic parsing ---

  Scenario: No footnotes returns empty map
    When I parse footnotes from:
      """
      # Title
      Some text
      """
    Then the footnote map has 0 entries

  Scenario: Single footnote with all fields
    When I parse footnotes from:
      """
      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    Then the footnote map has 1 entry
    And footnote "ct-1" has author "@alice"
    And footnote "ct-1" has date "2026-02-17"
    And footnote "ct-1" has type "ins"
    And footnote "ct-1" has status "proposed"
    And footnote "ct-1" has reason ""
    And footnote "ct-1" has reply count 0

  Scenario: Footnote with deletion type and accepted status
    When I parse footnotes from:
      """
      [^ct-2]: @bob | 2026-02-17 | del | accepted
      """
    Then the footnote map has 1 entry
    And footnote "ct-2" has status "accepted"
    And footnote "ct-2" has type "del"

  Scenario: Footnote with rejected status
    When I parse footnotes from:
      """
      [^ct-3]: @charlie | 2026-02-18 | sub | rejected
      """
    Then footnote "ct-3" has status "rejected"

  # --- Dotted IDs ---

  Scenario: Dotted ID for grouped changes
    When I parse footnotes from:
      """
      [^ct-5.2]: @alice | 2026-02-17 | del | proposed
      """
    Then the footnote map has 1 entry
    And footnote "ct-5.2" has author "@alice"

  # --- AI authors ---

  Scenario: AI author namespace
    When I parse footnotes from:
      """
      [^ct-3]: @ai:claude-opus-4.6 | 2026-02-18 | sub | rejected
      """
    Then footnote "ct-3" has author "@ai:claude-opus-4.6"

  # --- Reason metadata ---

  Scenario: Footnote with reason metadata
    When I parse footnotes from:
      """
      [^ct-1]: @alice | 2026-02-17 | sub | proposed
          reason: spelling fix
      """
    Then footnote "ct-1" has reason "spelling fix"

  # --- Thread replies ---

  Scenario: Thread replies are counted
    When I parse footnotes from:
      """
      [^ct-1]: @alice | 2026-02-17 | sub | proposed
          reason: clarity improvement
          @bob 2026-02-17: I think this is correct
          @alice 2026-02-17: Thanks for confirming
      """
    Then footnote "ct-1" has reply count 2
    And footnote "ct-1" has reason "clarity improvement"

  # --- Multiple footnotes ---

  Scenario: Multiple footnotes parsed independently
    When I parse footnotes from:
      """
      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      [^ct-2]: @bob | 2026-02-17 | del | accepted
      [^ct-3]: @ai:claude-opus-4.6 | 2026-02-18 | sub | rejected
      """
    Then the footnote map has 3 entries
    And footnote "ct-1" has status "proposed"
    And footnote "ct-2" has status "accepted"
    And footnote "ct-3" has status "rejected"

  # --- Blank lines within footnote ---

  Scenario: Blank lines within footnote continuation are tolerated
    When I parse footnotes from:
      """
      [^ct-1]: @alice | 2026-02-17 | sub | proposed
          reason: complex change

          @bob 2026-02-18: Looks good
      """
    Then footnote "ct-1" has reply count 1
    And footnote "ct-1" has reason "complex change"

  # --- Non-indented line stops scanning ---
  # The parser only scans the terminal footnote block (backward from EOF).
  # A non-indented, non-blank line between footnotes breaks the block,
  # so both footnotes must be contiguous. Body termination is verified
  # by checking that ct-1's endLine stops at its last indented line.

  Scenario: Next footnote header terminates previous footnote body
    When I parse footnotes from:
      """
      Some body text.

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
          reason: fix
      [^ct-2]: @bob | 2026-02-17 | del | accepted
      """
    Then the footnote map has 2 entries
    And footnote "ct-1" has start line 2
    And footnote "ct-1" has end line 3
    And footnote "ct-2" has start line 4

  # --- Line positions ---

  Scenario: Start and end line positions for single-line footnote
    When I parse footnotes from:
      """
      # Title

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    Then footnote "ct-1" has start line 2
    And footnote "ct-1" has end line 2

  Scenario: End line extends to last continuation line
    When I parse footnotes from:
      """
      [^ct-1]: @alice | 2026-02-17 | sub | proposed
          reason: clarity improvement
          @bob 2026-02-17: I think this is correct
          @alice 2026-02-17: Thanks for confirming
      """
    Then footnote "ct-1" has start line 0
    And footnote "ct-1" has end line 3

  # --- Content before footnotes ---

  Scenario: Content before footnote section is ignored
    When I parse footnotes from:
      """
      # My Document

      This is regular text with no markup.

      [^ct-1]: @alice | 2026-02-17 | ins | proposed
      """
    Then the footnote map has 1 entry
    And footnote "ct-1" has author "@alice"

  # ===========================================================================
  # Level 2 Metadata — Full Parser Pipeline
  # ===========================================================================
  # These scenarios exercise the CriticMarkupParser (not the lightweight
  # parseFootnotes helper) and verify that Level 2 metadata fields —
  # approvals, rejections, request-changes, context, revisions, discussion,
  # and resolution — are populated on ChangeNode.metadata.

  # --- Approvals ---

  Scenario: Parses approved lines into approvals array
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @eve 2024-01-20
          approved: @carol 2024-01-19 "Benchmarks look good"
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 2 approvals
    And change 1 approval 1 has author "@eve"
    And change 1 approval 1 has date "2024-01-20"
    And change 1 approval 1 has no reason
    And change 1 approval 2 has author "@carol"
    And change 1 approval 2 has date "2024-01-19"
    And change 1 approval 2 has reason "Benchmarks look good"

  # --- Rejections ---

  Scenario: Parses rejected lines into rejections array
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          rejected: @carol 2024-01-19 "Needs more benchmarking"
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 rejection
    And change 1 rejection 1 has author "@carol"
    And change 1 rejection 1 has date "2024-01-19"
    And change 1 rejection 1 has reason "Needs more benchmarking"

  # --- Request-Changes ---

  Scenario: Parses request-changes lines into requestChanges array
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          request-changes: @eve 2024-01-18 "Pick one protocol"
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 request-change
    And change 1 request-change 1 has author "@eve"
    And change 1 request-change 1 has date "2024-01-18"
    And change 1 request-change 1 has reason "Pick one protocol"

  # --- Context ---

  Scenario: Parses context into metadata.context
    Given the text is:
      """
      {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | proposed
          context: "The API should use {REST} for the public interface"
      """
    When I parse the text
    Then there is 1 change
    And change 1 has context "The API should use {REST} for the public interface"

  # --- Revisions ---

  Scenario: Parses revisions block into metadata.revisions
    Given the text is:
      """
      {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | proposed
          revisions:
            r1 @bob 2024-01-16: "OAuth 2.0"
            r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 2 revisions
    And change 1 revision 1 has label "r1"
    And change 1 revision 1 has author "@bob"
    And change 1 revision 1 has date "2024-01-16"
    And change 1 revision 1 has text "OAuth 2.0"
    And change 1 revision 2 has label "r2"
    And change 1 revision 2 has author "@bob"
    And change 1 revision 2 has date "2024-01-18"
    And change 1 revision 2 has text "OAuth 2.0 with JWT tokens"

  # --- Discussion with threading depth ---

  Scenario: Parses discussion comments with threading depth
    Given the text is:
      """
      {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | proposed
          @carol 2024-01-17: Why robust? Simple was intentional.
            @alice 2024-01-17: Simple undersells our capabilities.
              @dave 2024-01-18: Agreed with Alice on this.
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 3 discussion comments
    And change 1 discussion 1 has author "@carol"
    And change 1 discussion 1 has date "2024-01-17"
    And change 1 discussion 1 has text "Why robust? Simple was intentional."
    And change 1 discussion 1 has depth 0
    And change 1 discussion 2 has author "@alice"
    And change 1 discussion 2 has depth 1
    And change 1 discussion 3 has author "@dave"
    And change 1 discussion 3 has depth 2

  # --- Comment labels ---

  Scenario: Parses comment labels like question and issue/blocking
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          @bob 2024-01-16 [question]: What about latency requirements for gRPC?
          @carol 2024-01-17 [issue/blocking]: 100/min feels low for production.
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 2 discussion comments
    And change 1 discussion 1 has label "question"
    And change 1 discussion 1 has text "What about latency requirements for gRPC?"
    And change 1 discussion 2 has label "issue/blocking"
    And change 1 discussion 2 has text "100/min feels low for production."

  # --- Multi-line discussion comments ---

  Scenario: Parses multi-line discussion comments with continuation lines
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          @carol 2024-01-17: This needs more thought. The current rate limit
          is based on our staging environment, not production. We need to
          model this against actual traffic patterns before committing.
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 discussion comment
    And change 1 discussion 1 has author "@carol"
    And change 1 discussion 1 has multiline text:
      """
      This needs more thought. The current rate limit
      is based on our staging environment, not production. We need to
      model this against actual traffic patterns before committing.
      """

  # --- Resolution: resolved without reason ---

  Scenario: Parses resolved with author and date but no reason
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          resolved @dave 2024-01-17
      """
    When I parse the text
    Then there is 1 change
    And change 1 has resolution type "resolved"
    And change 1 resolution has author "@dave"
    And change 1 resolution has date "2024-01-17"
    And change 1 resolution has no reason

  # --- Resolution: resolved with reason ---

  Scenario: Parses resolved with author, date, and reason
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          resolved @carol 2024-01-18: Addressed by r2
      """
    When I parse the text
    Then there is 1 change
    And change 1 has resolution type "resolved"
    And change 1 resolution has author "@carol"
    And change 1 resolution has date "2024-01-18"
    And change 1 resolution has reason "Addressed by r2"

  # --- Resolution: open with reason ---

  Scenario: Parses open with reason
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          open -- awaiting load test results from @dave
      """
    When I parse the text
    Then there is 1 change
    And change 1 has resolution type "open"
    And change 1 resolution has reason "awaiting load test results from @dave"

  # --- Resolution: bare open ---

  Scenario: Parses bare open resolution
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          open
      """
    When I parse the text
    Then there is 1 change
    And change 1 has resolution type "open"
    And change 1 resolution has no reason

  # --- reason: backward compat ---

  Scenario: Maps reason to discussion comment by footnote author
    Given the text is:
      """
      {--removed--}[^ct-1]

      [^ct-1]: @bob | 2024-01-15 | del | proposed
          reason: This paragraph was redundant
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 discussion comment
    And change 1 discussion 1 has author "@bob"
    And change 1 discussion 1 has date "2024-01-15"
    And change 1 discussion 1 has text "This paragraph was redundant"
    And change 1 discussion 1 has depth 0
    And change 1 has no metadata comment

  # --- Complete Level 2 spec example ---

  Scenario: Parses the complete Level 2 spec example
    Given the text is:
      """
      The API should use {~~REST~>GraphQL~~}[^ct-1] for the public interface.

      [^ct-1]: @alice | 2024-01-15 | sub | accepted
          approved: @eve 2024-01-20
          context: "The API should use {REST} for the public interface"
          @alice 2024-01-15: GraphQL reduces over-fetching for dashboard clients.
          @dave 2024-01-16: GraphQL increases client complexity.
            @alice 2024-01-16: But reduces over-fetching. See PR #42.
          resolved @dave 2024-01-17
      """
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-1"
    And change 1 has metadata author "@alice"
    And change 1 has metadata date "2024-01-15"
    And change 1 has 1 approval
    And change 1 approval 1 has author "@eve"
    And change 1 approval 1 has date "2024-01-20"
    And change 1 has context "The API should use {REST} for the public interface"
    And change 1 has 3 discussion comments
    And change 1 discussion 1 has author "@alice"
    And change 1 discussion 1 has text "GraphQL reduces over-fetching for dashboard clients."
    And change 1 discussion 1 has depth 0
    And change 1 discussion 2 has author "@dave"
    And change 1 discussion 2 has text "GraphQL increases client complexity."
    And change 1 discussion 2 has depth 0
    And change 1 discussion 3 has author "@alice"
    And change 1 discussion 3 has text "But reduces over-fetching. See PR #42."
    And change 1 discussion 3 has depth 1
    And change 1 has resolution type "resolved"
    And change 1 resolution has author "@dave"
    And change 1 resolution has date "2024-01-17"
    And change 1 resolution has no reason

  # --- AI authors in discussion ---

  Scenario: Parses AI authors in discussion
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @ai:claude-opus-4.6 | 2024-01-15 | ins | proposed
          @ai:claude-opus-4.6 2024-01-15: I suggest this change for clarity.
            @alice 2024-01-16: Agreed, good suggestion.
      """
    When I parse the text
    Then there is 1 change
    And change 1 has metadata author "@ai:claude-opus-4.6"
    And change 1 has 2 discussion comments
    And change 1 discussion 1 has author "@ai:claude-opus-4.6"
    And change 1 discussion 1 has depth 0
    And change 1 discussion 2 has author "@alice"
    And change 1 discussion 2 has depth 1

  # --- Header-only footnote ---

  Scenario: Header-only footnote leaves Level 2 fields undefined
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      """
    When I parse the text
    Then there is 1 change
    And change 1 has metadata author "@alice"
    And change 1 has no discussion
    And change 1 has no approvals
    And change 1 has no resolution
    And change 1 has no context
    And change 1 has no revisions

  # --- Approval without quoted reason ---

  Scenario: Approval without quoted reason has no reason field
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @eve 2024-01-20
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 approval
    And change 1 approval 1 has no reason

  # --- Discussion comment with empty text after colon ---

  Scenario: Discussion comment with empty text after colon
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          @bob 2024-01-16:
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 discussion comment
    And change 1 discussion 1 has text ""

  # --- Blank lines within footnote body (Level 2) ---

  Scenario: Tolerates blank lines within Level 2 footnote body
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @eve 2024-01-20

          @carol 2024-01-17: First comment.

          @dave 2024-01-18: Second comment.
          resolved @dave 2024-01-18
      """
    When I parse the text
    Then there is 1 change
    And change 1 has 1 approval
    And change 1 has 2 discussion comments
    And change 1 discussion 1 has author "@carol"
    And change 1 discussion 2 has author "@dave"
    And change 1 has resolution type "resolved"
    And change 1 resolution has author "@dave"
    And change 1 resolution has date "2024-01-18"
    And change 1 resolution has no reason

  # --- Mixed metadata and discussion ---

  Scenario: Parses mixed metadata and discussion interleaved correctly
    Given the text is:
      """
      {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          context: "Some {context} here"
          approved: @eve 2024-01-20
          rejected: @frank 2024-01-19 "Not convinced"
          request-changes: @grace 2024-01-18 "Needs tests"
          revisions:
            r1 @alice 2024-01-16: "First draft"
          @alice 2024-01-15: Initial rationale.
            @bob 2024-01-16 [suggestion]: Consider an alternative approach.
          resolved @alice 2024-01-20: All feedback addressed
      """
    When I parse the text
    Then there is 1 change
    And change 1 has context "Some {context} here"
    And change 1 has 1 approval
    And change 1 has 1 rejection
    And change 1 rejection 1 has reason "Not convinced"
    And change 1 has 1 request-change
    And change 1 request-change 1 has reason "Needs tests"
    And change 1 has 1 revision
    And change 1 revision 1 has label "r1"
    And change 1 has 2 discussion comments
    And change 1 discussion 1 has depth 0
    And change 1 discussion 2 has depth 1
    And change 1 discussion 2 has label "suggestion"
    And change 1 has resolution type "resolved"
    And change 1 resolution has author "@alice"
    And change 1 resolution has date "2024-01-20"
    And change 1 resolution has reason "All feedback addressed"

  # ===========================================================================
  # Settled Ref Detection (post-Layer-1 settlement)
  # ===========================================================================
  # After Layer 1 settlement, inline CriticMarkup is removed but the [^ct-N]
  # ref and its footnote remain. The parser synthesizes a ChangeNode from these
  # standalone refs so tooling can still navigate to and display them.

  Scenario: Synthesizes ChangeNode from standalone settled ref with footnote
    Given the text is:
      """
      The API uses REST[^ct-1] for all endpoints.

      [^ct-1]: @ai:claude-opus-4.6 | 2026-02-20 | sub | accepted
      """
    When I parse the text
    Then there is 1 change
    And change 1 has id "ct-1"
    And change 1 is type "Substitution"
    And change 1 is settled
    And change 1 has level 2

  Scenario: Does not synthesize when ref is attached to CriticMarkup
    Given the text is:
      """
      {++new text++}[^ct-1]

      [^ct-1]: @alice | 2026-02-20 | ins | proposed
      """
    When I parse the text
    Then there is 1 change
    And change 1 is type "Insertion"
    And change 1 is not settled

  Scenario: Ignores standalone ref with no matching footnote
    Given the text "Some text[^ct-99] with an orphan ref."
    When I parse the text
    Then there are 0 changes
