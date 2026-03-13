@slow @G9 @bug @fixture(tracking-mode-test) @destructive
Feature: G9 — Tracking mode deletion markup correctness
  As a document author using tracking mode
  I want deletions to wrap the correct characters in {--...--}
  So the change record accurately reflects what was removed

  # -----------------------------------------------------------------------
  # BUG HYPOTHESIS (G9): Shadow document synchronization in controller.ts
  # extracts wrong deleted text from documentShadow during rapid edits.
  #
  # INVESTIGATION RESULT: Bug REFUTED. The shadow document synchronization
  # is safe because:
  #   1. onDidChangeTextDocument is async-awaited: handleTrackedEdits is
  #      awaited BEFORE the shadow is updated (line 271-276 in controller.ts)
  #   2. The shadow update happens on line 276 AFTER the await completes
  #   3. VS Code's event loop serializes onDidChangeTextDocument calls --
  #      the next event does not fire until the async handler returns
  #   4. The isApplyingTrackedEdit guard prevents the handler from running
  #      on its own edits (the {--...--} markup insertion), and the shadow
  #      update still happens for those events on line 276
  #
  # These scenarios serve as REGRESSION TESTS to ensure this safety holds.
  # If any scenario fails, the shadow synchronization has regressed.
  # -----------------------------------------------------------------------

  # TIER: @slow -- requires VS Code Extension Host + Playwright
  # These tests exercise the full controller.ts -> PendingEditManager pipeline
  # via real VS Code document edits. The shadow document mechanism cannot be
  # tested in @fast tier because it depends on onDidChangeTextDocument events.

  Background:
    Given I open "tracking-mode-test.md" in VS Code
    And the editor is reset to the fixture
    And the ChangeTracks extension is active
    And tracking mode is enabled

  # --- Single deletion correctness ---

  Scenario: Single character deletion via Backspace wraps correct character
    # Line 3 (0-based) of tracking-mode-test.md is:
    #   "This is a clean document for testing tracking mode."
    # Position cursor at column 5 (after "This "), Backspace deletes the space.
    # The shadow document should extract " " (space at index 4).
    When I position the cursor at line 3 column 5
    And I press "Backspace"
    And I wait for edit boundary detection
    Then the document contains "{-- --}"

  Scenario: Single character forward-delete wraps correct character
    # Position cursor at column 0 of line 3 ("This is a clean...").
    # Forward-delete removes "T".
    When I position the cursor at line 3 column 0
    And I press "Delete"
    And I wait for edit boundary detection
    Then the document contains "{--T--}"

  # --- Multi-character deletion correctness ---

  Scenario: Word selection deletion wraps exact selected text
    # Select "clean" on line 3 (columns 10-15) and delete it.
    # Shadow must extract exactly "clean".
    When I select from line 3 column 10 to line 3 column 15
    And I press "Delete"
    And I wait for edit boundary detection
    Then the document contains "{--clean--}"

  # --- Rapid sequential deletions ---

  Scenario: Two rapid Backspaces wrap correct characters in order
    # Line 3: "This is a clean document..."
    # Cursor at column 5 (after "This "). First backspace: space.
    # Cursor auto-moves to column 4. Second backspace: "s".
    # With merge logic, result should be {--s --} (prepended in reverse order).
    When I position the cursor at line 3 column 5
    And I press "Backspace"
    And I press "Backspace"
    And I wait for edit boundary detection
    Then the document contains "{--s --}"

  # --- Deletion after insertion (shadow must account for inserted markup) ---

  Scenario: Deletion after typed insertion wraps correct character
    # Type text first, wait for it to be wrapped, then delete a different character.
    # This exercises the shadow update after insertion markup is applied.
    When I position the cursor at line 3 column 0
    And I type "X" into the editor
    And I wait for edit boundary detection
    Then the document contains "{++X++}"
    # Now delete a character on a different line. The shadow must reflect
    # the current state (including insertion markup) so it extracts correctly.
    # Line 5 (0-based): "Type here to test insertion wrapping."
    # Column 0 is "T", so forward-delete should wrap "T".
    When I position the cursor at line 5 column 0
    And I press "Delete"
    And I wait for edit boundary detection
    Then the document contains "{--T--}"
