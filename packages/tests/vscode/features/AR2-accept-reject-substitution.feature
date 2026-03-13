@fast @accept-reject @AR2
Feature: Accept and reject substitution changes
  As a document reviewer
  I want to accept or reject substitutions and handle multiple changes
  So that I can selectively resolve tracked changes

  # ── Accept substitution ─────────────────────────────────────────────

  Scenario: Accept substitution change
    Given a document with text "Hello {~~world~>universe~~} there"
    And the cursor is at offset 10
    When I accept the change at the cursor
    Then the document text is "Hello universe there"

  Scenario: Accept multi-line substitution
    Given a document with text:
      """
      Line 1
      {~~old
      text~>new
      text~~}
      Line 4
      """
    And the cursor is at offset 12
    When I accept the change at the cursor
    Then the document text is:
      """
      Line 1
      new
      text
      Line 4
      """

  # ── Reject substitution ─────────────────────────────────────────────

  Scenario: Reject substitution change
    Given a document with text "Hello {~~world~>universe~~} there"
    And the cursor is at offset 10
    When I reject the change at the cursor
    Then the document text is "Hello world there"

  Scenario: Reject multi-line substitution
    Given a document with text:
      """
      Line 1
      {~~old
      text~>new
      text~~}
      Line 4
      """
    And the cursor is at offset 12
    When I reject the change at the cursor
    Then the document text is:
      """
      Line 1
      old
      text
      Line 4
      """

  # ── Multiple changes in document ────────────────────────────────────

  Scenario: Accept first of multiple changes
    Given a document with text "{++first++} middle {--second--} end"
    And the cursor is at offset 5
    When I accept the change at the cursor
    Then the document text is "first middle {--second--} end"

  Scenario: Accept second of multiple changes
    Given a document with text "{++first++} middle {--second--} end"
    And the cursor is at offset 25
    When I accept the change at the cursor
    Then the document text is "{++first++} middle  end"

  # ── Cursor not in change ────────────────────────────────────────────

  Scenario: Cursor not in a change — document stays unchanged
    Given a document with text "Hello world there"
    And the cursor is at offset 5
    When I try to accept the change at the cursor
    Then the document text is "Hello world there"
    And the parser finds 0 changes remaining
