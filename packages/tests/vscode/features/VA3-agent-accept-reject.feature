@fast @agent-content @VA3
Feature: Accept/Reject Agent Changes with Footnote Lifecycle
  Accept and reject operations on agent-created changes update both
  the document body (removing CriticMarkup delimiters) and the footnote
  section (status updates, approval/rejection lines). Footnote references
  [^ct-N] are preserved in the body for audit trail.

  Background:
    Given reviewer identity is "human:reviewer"

  # ─── Single Accept with Footnote Updates ─────────────────────────

  Scenario: Accept agent insertion updates footnote to accepted
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
          Added for clarity
      """
    And the cursor is at offset 10
    When I accept the change at the cursor with footnote update
    Then the document text starts with "Hello world[^ct-1] end"
    And the document contains footnote status "accepted"
    And the document text does not contain "| proposed"
    And the document contains approval from "@human:reviewer"
    And the document text contains "Added for clarity"

  Scenario: Reject agent insertion removes text and updates footnote
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    And the cursor is at offset 10
    When I reject the change at the cursor with footnote update
    Then the document text starts with "Hello [^ct-1] end"
    And the document contains footnote status "rejected"
    And the document text does not contain "| proposed"
    And the document contains rejection from "@human:reviewer"

  Scenario: Accept agent substitution keeps new text
    Given a document with text:
      """
      {~~REST~>GraphQL~~}[^ct-1] API

      [^ct-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
          Better query flexibility
      """
    And the cursor is at offset 5
    When I accept the change at the cursor with footnote update
    Then the document text starts with "GraphQL[^ct-1] API"
    And the document contains footnote status "accepted"
    And the document text does not contain "| proposed"

  Scenario: Reject agent substitution restores original text
    Given a document with text:
      """
      {~~REST~>GraphQL~~}[^ct-1] API

      [^ct-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
      """
    And the cursor is at offset 5
    When I reject the change at the cursor with footnote update
    Then the document text starts with "REST[^ct-1] API"
    And the document contains footnote status "rejected"

  Scenario: Accept agent deletion removes the deleted text
    Given a document with text:
      """
      Keep {--remove this--}[^ct-1] keep

      [^ct-1]: @ai:claude | 2026-02-10T09:00:00Z | del | proposed
      """
    And the cursor is at offset 10
    When I accept the change at the cursor with footnote update
    Then the document text starts with "Keep [^ct-1] keep"
    And the document contains footnote status "accepted"

  Scenario: Reject agent deletion keeps the deleted text
    Given a document with text:
      """
      Keep {--remove this--}[^ct-1] keep

      [^ct-1]: @ai:claude | 2026-02-10T09:00:00Z | del | proposed
      """
    And the cursor is at offset 10
    When I reject the change at the cursor with footnote update
    Then the document text starts with "Keep remove this[^ct-1] keep"
    And the document contains footnote status "rejected"

  # ─── Accept All / Reject All with Agent Footnotes ────────────────

  Scenario: Accept All accepts all agent-proposed changes
    Given a document with text:
      """
      The {~~REST~>GraphQL~~}[^ct-1] API.
      Auth uses {~~keys~>OAuth2~~}[^ct-2].
      {++Rate limiting added.++}[^ct-3]

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
      [^ct-2]: @ai:drafter | 2026-02-10 | sub | proposed
      [^ct-3]: @ai:claude | 2026-02-10 | ins | proposed
      """
    When I accept all changes with footnote update
    Then the document text does not contain "{~~"
    And the document text does not contain "{++"
    And the document text contains "GraphQL"
    And the document text contains "OAuth2"
    And the document text contains "Rate limiting added."
    And the document text does not contain "| proposed"
    And the document text matches "\| accepted" exactly 3 times
    And 3 approval lines from "@human:reviewer" exist

  Scenario: Reject All reverts all agent changes
    Given a document with text:
      """
      The {~~REST~>GraphQL~~}[^ct-1] API.
      Auth uses {~~keys~>OAuth2~~}[^ct-2].
      {++Rate limiting added.++}[^ct-3]

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
      [^ct-2]: @ai:drafter | 2026-02-10 | sub | proposed
      [^ct-3]: @ai:claude | 2026-02-10 | ins | proposed
      """
    When I reject all changes with footnote update
    Then the document text does not contain "{~~"
    And the document text does not contain "{++"
    And the document text contains "REST"
    And the document text contains "keys"
    And the document text does not contain "Rate limiting added."
    And the document text does not contain "| proposed"
    And the document text matches "\| rejected" exactly 3 times
    And 3 rejection lines from "@human:reviewer" exist

  # ─── Discussion Thread Preservation ──────────────────────────────

  Scenario: Accept preserves discussion thread in footnote
    Given a document with text:
      """
      {~~old~>new~~}[^ct-1]

      [^ct-1]: @ai:drafter | 2026-02-10 | sub | proposed
          Original reasoning
          @ai:reviewer 2026-02-10: Needs improvement
            @ai:drafter 2026-02-10: Updated per feedback
      """
    And the cursor is at offset 5
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document text contains "Original reasoning"
    And the document text contains "@ai:reviewer 2026-02-10: Needs improvement"
    And the document text contains "@ai:drafter 2026-02-10: Updated per feedback"
    And the document contains approval from "@human:reviewer"

  Scenario: Reject preserves discussion thread in footnote
    Given a document with text:
      """
      {~~old~>new~~}[^ct-1]

      [^ct-1]: @ai:drafter | 2026-02-10 | sub | proposed
          Original reasoning
          @ai:reviewer 2026-02-10: Needs improvement
      """
    And the cursor is at offset 5
    When I reject the change at the cursor with footnote update
    Then the document contains footnote status "rejected"
    And the document text contains "Original reasoning"
    And the document text contains "@ai:reviewer 2026-02-10: Needs improvement"
    And the document contains rejection from "@human:reviewer"

  # ─── Agent Content Edge Cases ────────────────────────────────────

  Scenario: Accept without reviewer identity only updates status
    Given no reviewer identity is set
    And no author identity is set
    And a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document text does not contain "approved" line

  Scenario: Approval line format matches spec
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    When I accept the change at the cursor with footnote update
    Then the document contains approval from "@human:reviewer"
    And the approval line matches format "^\s+approved: @\S+ \d{4}-\d{2}-\d{2}"

  Scenario: Rejection line format matches spec
    Given a document with text:
      """
      Hello {--remove--}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | del | proposed
      """
    And the cursor is at offset 10
    When I reject the change at the cursor with footnote update
    Then the document contains rejection from "@human:reviewer"

  Scenario: Footnote ref preserved in body after accept
    Given a document with text:
      """
      Text {++inserted++}[^ct-1] more

      [^ct-1]: @ai:claude | 2026-02-10 | ins | proposed
      """
    And the cursor is at offset 10
    When I accept the change at the cursor with footnote update
    Then the document text contains "[^ct-1]"
    And the document text starts with "Text inserted[^ct-1] more"

  Scenario: Footnote ref preserved in body after reject
    Given a document with text:
      """
      Text {++inserted++}[^ct-1] more

      [^ct-1]: @ai:claude | 2026-02-10 | ins | proposed
      """
    And the cursor is at offset 10
    When I reject the change at the cursor with footnote update
    Then the document text contains "[^ct-1]"
    And the document text starts with "Text [^ct-1] more"

  Scenario: Multi-agent document Accept All updates all footnotes
    Given a document with text:
      """
      {++first++}[^ct-1] and {++second++}[^ct-2]

      [^ct-1]: @ai:claude | 2026-02-10 | ins | proposed
      [^ct-2]: @ai:drafter | 2026-02-10 | ins | proposed
      """
    When I accept all changes with footnote update
    Then the document text does not contain "| proposed"
    And the document text matches "\| accepted" exactly 2 times
    And 2 approval lines from "@human:reviewer" exist
