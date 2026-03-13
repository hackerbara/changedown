@fast @accept-reject @AR1
Feature: Accept and reject basic change types
  As a document reviewer
  I want to accept or reject individual changes at my cursor
  So that I can resolve tracked changes one at a time

  # ── Accept insertion ────────────────────────────────────────────────

  Scenario: Accept insertion change
    Given a document with text "Hello {++world++} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello world there"

  Scenario: Accept empty insertion
    Given a document with text "Hello {++++} there"
    And the cursor is at offset 8
    When I accept the change at the cursor
    Then the document text is "Hello  there"

  Scenario: Accept multi-line insertion
    Given a document with text:
      """
      Line 1
      {++Line 2
      Line 3++}
      Line 4
      """
    And the cursor is at offset 12
    When I accept the change at the cursor
    Then the document text is:
      """
      Line 1
      Line 2
      Line 3
      Line 4
      """

  # ── Accept deletion ─────────────────────────────────────────────────

  Scenario: Accept deletion change
    Given a document with text "Hello {--world--} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello  there"

  Scenario: Accept empty deletion
    Given a document with text "Hello {----} there"
    And the cursor is at offset 8
    When I accept the change at the cursor
    Then the document text is "Hello  there"

  # ── Accept highlight ────────────────────────────────────────────────

  Scenario: Accept highlight change
    Given a document with text "Hello {==important==} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello important there"

  Scenario: Accept highlight with comment
    Given a document with text "Hello {==important==}{>>note<<} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello important there"

  # ── Accept comment ──────────────────────────────────────────────────

  Scenario: Accept standalone comment
    Given a document with text "Hello {>>comment<<} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello  there"

  # ── Reject insertion ────────────────────────────────────────────────

  Scenario: Reject insertion change
    Given a document with text "Hello {++world++} there"
    And the cursor is at offset 10
    When I reject the change at the cursor
    Then the document text is "Hello  there"

  Scenario: Reject empty insertion
    Given a document with text "Hello {++++} there"
    And the cursor is at offset 8
    When I reject the change at the cursor
    Then the document text is "Hello  there"

  # ── Reject deletion ─────────────────────────────────────────────────

  Scenario: Reject deletion change
    Given a document with text "Hello {--world--} there"
    And the cursor is at offset 10
    When I reject the change at the cursor
    Then the document text is "Hello world there"

  Scenario: Reject empty deletion
    Given a document with text "Hello {----} there"
    And the cursor is at offset 8
    When I reject the change at the cursor
    Then the document text is "Hello  there"

  Scenario: Reject multi-line deletion
    Given a document with text:
      """
      Line 1
      {--Line 2
      Line 3--}
      Line 4
      """
    And the cursor is at offset 12
    When I reject the change at the cursor
    Then the document text is:
      """
      Line 1
      Line 2
      Line 3
      Line 4
      """

  # ── Reject highlight ────────────────────────────────────────────────

  Scenario: Reject highlight change (same as accept)
    Given a document with text "Hello {==important==} there"
    And the cursor is at offset 10
    When I reject the change at the cursor
    Then the document text is "Hello important there"

  # ── Reject comment ──────────────────────────────────────────────────

  Scenario: Reject comment change
    Given a document with text "Hello {>>comment<<} there"
    And the cursor is at offset 10
    When I reject the change at the cursor
    Then the document text is "Hello  there"

  # ── Cursor position edge cases ──────────────────────────────────────

  Scenario: Accept with cursor at start of change (opening delimiter)
    Given a document with text "Hello {++world++} there"
    And the cursor is at offset 6
    When I accept the change at the cursor
    Then the document text is "Hello world there"

  Scenario: Accept with cursor at end of change (closing delimiter)
    Given a document with text "Hello {++world++} there"
    And the cursor is at offset 16
    When I accept the change at the cursor
    Then the document text is "Hello world there"

  Scenario: Accept with cursor in content of change
    Given a document with text "Hello {++world++} there"
    And the cursor is at offset 11
    When I accept the change at the cursor
    Then the document text is "Hello world there"

  # ── Surrounding text preservation ───────────────────────────────────

  Scenario: Accept preserves surrounding text
    Given a document with text "Start {++middle++} End"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Start middle End"

  Scenario: Accept whitespace-only insertion
    Given a document with text "Text {++   ++} more"
    And the cursor is at offset 8
    When I accept the change at the cursor
    Then the document text is "Text     more"

  # ── Empty / no-change documents ─────────────────────────────────────

  Scenario: Accept all on empty document
    Given a document with text ""
    When I accept all changes in the document
    Then the document text is ""

  Scenario: Accept all on document with no changes
    Given a document with text "Just plain markdown text"
    When I accept all changes in the document
    Then the document text is "Just plain markdown text"
