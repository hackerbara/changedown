@fast @comment @COM1
Feature: COM1 -- Comment insertion logic
  Port of InsertComment.test.ts (6 mocha tests).
  Tests the core insertComment function from @changetracks/core which
  produces TextEdits for inline comment and highlight+comment wrapping.

  # ── Insert comment at cursor (no selection) ─────────────────────────

  Scenario: Insert comment at cursor position with no selection
    Given a comment document with text "This is a test sentence."
    And no text is selected
    And the comment cursor is at offset 10
    When I insert comment "Test comment"
    Then the comment result text contains "{>>"
    And the comment result text contains "<<}"
    And the comment result text contains "{>> Test comment <<}"

  # ── Insert comment wrapping selection ───────────────────────────────

  Scenario: Insert comment wraps selection in highlight + comment
    Given a comment document with text "This is a test sentence."
    And text is selected from offset 5 to offset 7
    When I insert comment "Test comment"
    Then the comment result text contains "{==is==}"
    And the comment result text contains "{>> Test comment <<}"
    And the comment result text contains "{==is==}{>> Test comment <<}"

  Scenario: Insert comment with multi-word selection
    Given a comment document with text "This is a test sentence."
    And text is selected from offset 5 to offset 16
    When I insert comment "Test comment"
    Then the comment result text contains "{==is a test s==}"
    And the comment result text contains "{>> Test comment <<}"

  # ── Multiple comments ───────────────────────────────────────────────

  Scenario: Multiple comments can be inserted sequentially
    Given a comment document with text "This is a test sentence."
    And no text is selected
    And the comment cursor is at offset 5
    When I insert comment "First comment"
    And I insert another comment at offset 20 with text "Second comment"
    Then the comment result text contains at least 2 comment markers

  # ── Empty document ──────────────────────────────────────────────────

  Scenario: Insert comment into empty document
    Given a comment document with text ""
    And no text is selected
    And the comment cursor is at offset 0
    When I insert comment "Test comment"
    Then the comment result text contains "{>> Test comment <<}"

  # ── Markdown-only guard (NOT testable at @fast tier) ───────────────────
  # The addComment command in ExtensionController silently no-ops for
  # non-markdown files. This guard is NOT in @changetracks/core so it
  # requires VS Code Extension Host to test.
  # See: EXT1-extension-lifecycle.feature for the @integration version,
  # or add a dedicated COM1-integration.feature when the @slow
  # infrastructure supports it.
  # Mocha reference: InsertComment.test.ts (markdown-only guard)
