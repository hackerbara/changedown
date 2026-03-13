@fast @accept-reject @AR4
Feature: Accept/reject with footnote updates and reviewer attribution
  As a document reviewer with a configured identity
  I want accept/reject operations to update footnote status and record attribution
  So that the audit trail reflects who approved or rejected each change

  # ── Accept with reviewer identity ───────────────────────────────────

  Scenario: Accept with reviewerIdentity records approved in footnote
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    And reviewer identity is "human:alice"
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document contains approval from "@human:alice"

  # ── Reject with reviewer identity ───────────────────────────────────

  Scenario: Reject with reviewerIdentity records rejected in footnote
    Given a document with text:
      """
      Hello {--remove--}[^ct-2] end

      [^ct-2]: @ai:bot | 2026-02-12 | del | proposed
      """
    And the cursor is at offset 10
    And reviewer identity is "human:bob"
    When I reject the change at the cursor with footnote update
    Then the document contains footnote status "rejected"
    And the document contains rejection from "@human:bob"

  # ── No reviewer identity ────────────────────────────────────────────

  Scenario: Accept without identity updates status only (no approved line)
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    And no reviewer identity is set
    And no author identity is set
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document text does not contain "approved" line

  # ── Accept All with reviewer identity ───────────────────────────────

  Scenario: Accept All with reviewerIdentity adds approved line per footnote
    Given a document with text:
      """
      One {++a++}[^ct-1] two {~~x~>y~~}[^ct-2] three.

      [^ct-1]: @alice | 2026-02-10 | ins | proposed
      [^ct-2]: @bob | 2026-02-10 | sub | proposed
      """
    And reviewer identity is "human:carol"
    When I accept all changes with footnote update
    Then the document text does not contain "| proposed"
    And 2 approval lines from "@human:carol" exist

  # ── Reject All with reviewer identity ───────────────────────────────

  Scenario: Reject All with reviewerIdentity adds rejected line per footnote
    Given a document with text:
      """
      A {++x++}[^ct-1] B {--y--}[^ct-2] C.

      [^ct-1]: @alice | 2026-02-10 | ins | proposed
      [^ct-2]: @bob | 2026-02-10 | del | proposed
      """
    And reviewer identity is "human:dave"
    When I reject all changes with footnote update
    Then the document text does not contain "| proposed"
    And 2 rejection lines from "@human:dave" exist

  # ── Footnote body preservation ──────────────────────────────────────

  Scenario: Accept preserves existing footnote body (discussion thread)
    Given a document with text:
      """
      Use {~~REST~>GraphQL~~}[^ct-1] here.

      [^ct-1]: @alice | 2026-02-10 | sub | proposed
          @alice 2026-02-10: Consider using GraphQL instead
      """
    And the cursor is at offset 8
    And reviewer identity is "human:eve"
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document contains approval from "@human:eve"
    And the document text contains "@alice 2026-02-10: Consider using GraphQL instead"

  # ── Approval line format (ADR-012) ──────────────────────────────────

  Scenario: Approval line format matches ADR-012 spec
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    And reviewer identity is "human:alice"
    When I accept the change at the cursor with footnote update
    Then the approval line matches format "^    approved: @\S+ \d{4}-\d{2}-\d{2}"
    And the document contains approval from "@human:alice"

  # ── Approval line uses UTC date (ADR-031) ───────────────────────────

  Scenario: Approval line contains todays UTC date
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    And reviewer identity is "human:alice"
    When I accept the change at the cursor with footnote update
    Then the approval line contains todays UTC date

  # ── Author fallback ─────────────────────────────────────────────────

  Scenario: Author fallback when only author is set (no reviewerIdentity)
    Given a document with text:
      """
      Hello {++world++}[^ct-1] end

      [^ct-1]: @ai:bot | 2026-02-12 | ins | proposed
      """
    And the cursor is at offset 10
    And no reviewer identity is set
    And author identity is "human:fallback"
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document contains approval from "@human:fallback"

  # ── Archive on accept ───────────────────────────────────────────────

  Scenario: Archive on accept adds archive line with reference text
    Given a document with text:
      """
      Use {~~REST~>GraphQL~~}[^ct-1] here.

      [^ct-1]: @alice | 2026-02-10 | sub | proposed
      """
    And the cursor is at offset 8
    And reviewer identity is "human:alice"
    And archive on accept is enabled
    When I accept the change at the cursor with footnote update
    Then the document contains footnote status "accepted"
    And the document contains approval from "@human:alice"
    And the document contains archive line
    And the document text contains "REST"
    And the document text contains "GraphQL"
