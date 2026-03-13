@integration @EB1
Feature: Edit boundary detection — core behavior
  As a document author using tracking mode
  I want my keystrokes coalesced into logical edit units
  So individual characters are grouped into meaningful changes

  # -----------------------------------------------------------------------
  # TIER DECISION: @integration (NOT @fast)
  #
  # These tests CANNOT run in-process (@fast) because they depend on:
  #   1. vscode.TextEditor.edit() for simulating typing, deletion, substitution
  #   2. vscode.workspace.openTextDocument() for document management
  #   3. Real timer behavior (setTimeout for pause threshold)
  #   4. VS Code events (onDidChangeTextDocument, selection changes)
  #   5. ExtensionController + PendingEditManager wired to VS Code document model
  #   6. vscode.Range and vscode.Position used internally by PendingEditManager
  #
  # The PendingEditManager cannot be unit-tested in isolation because its
  # constructor takes callbacks that operate on vscode.TextDocument and
  # vscode.Range objects. Mocking these would not exercise real behavior.
  # -----------------------------------------------------------------------

  # === INSERTION COALESCING ===

  Scenario: Adjacent character insertions coalesce into single change
    # Mocha: 'coalesces adjacent character insertions into single change'
    # Types "hello" one char at a time, moves cursor to flush.
    # Expects single {++hello++} insertion, not five separate ones.
    Given a tracking-mode editor with content "Start here."
    When I type "h", "e", "l", "l", "o" at the end with 50ms gaps
    And I move the cursor to position 0,0
    Then the tracked document contains exactly 1 insertion marker
    And the tracked document contains "{++hello++}"

  # === PAUSE TIMER ===

  Scenario: Pause timer fires after threshold and flushes pending edit
    # Mocha: 'pause timer fires after threshold and flushes pending edit'
    # Inserts "test", waits for 2000ms pause timer to fire.
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "test" at the end
    And I wait 200ms
    Then the tracked document text is "Start here.test"
    When I wait 2400ms
    Then the tracked document contains "{++test++}"

  Scenario: Pause timer resets on each adjacent keystroke
    # Mocha: 'pause timer resets on each adjacent keystroke'
    # Types "a", waits 1500ms, types "b", waits 1500ms. Timer should not have
    # fired yet (reset by second keystroke). After 700ms more, timer fires.
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "a" at the end
    And I wait 1500ms
    And I insert "b" adjacent
    And I wait 1500ms
    Then the tracked document text is "Start here.ab"
    When I wait 700ms
    Then the tracked document contains "{++ab++}"

  Scenario: pauseThresholdMs 0 means timer never fires
    # Mocha: 'pauseThresholdMs 0 means never break on pause (never fires)'
    # With threshold 0, text stays pending indefinitely.
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 0ms
    When I insert "test" at the end
    And I wait 5000ms
    Then the tracked document text is "Start here.test"

  Scenario: pauseThresholdMs 500 fires after ~500ms
    # Mocha: 'pauseThresholdMs 500 fires after ~500ms'
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 500ms
    When I insert "test" at the end
    And I wait 100ms
    Then the tracked document text is "Start here.test"
    When I wait 700ms
    Then the tracked document contains "{++test++}"

  Scenario: pauseThresholdMs 2000 (default) fires after ~2s
    # Mocha: 'pauseThresholdMs 2000 (default) fires after ~2s'
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "test" at the end
    And I wait 200ms
    Then the tracked document text is "Start here.test"
    When I wait 2400ms
    Then the tracked document contains "{++test++}"

  # === BREAK ON NEWLINE ===

  Scenario: breakOnNewline splits insertion into one change per line
    # Mocha: 'breakOnNewline splits insertion into one change per line'
    Given a tracking-mode editor with content "Start here."
    And breakOnNewline is enabled
    And pasteMinChars is 100
    When I insert "a\nb" at the end
    And I wait 200ms
    Then the tracked document contains exactly 2 insertion markers

  # === DELETION TESTS ===

  Scenario: Single character deletion wraps immediately
    # Mocha: 'single character deletion wraps immediately as {--char--}'
    Given a tracking-mode editor with content "Hello world"
    When I delete the character at position 0,6
    And I wait 100ms
    Then the tracked document contains "{--w--}"

  Scenario: Multi-character deletion wraps immediately
    # Mocha: 'multi-character deletion wraps immediately'
    Given a tracking-mode editor with content "Hello world"
    When I delete the range 0,6 to 0,11
    And I wait 100ms
    Then the tracked document contains "{--world--}"

  Scenario: Consecutive backspace deletions merge into single block
    # Mocha: 'consecutive deletions at same position extend existing deletion'
    # Backspaces "d", "l", "r" from end of "world". Result: {--rld--}
    Given a tracking-mode editor with content "Hello world"
    When I backspace-delete at position 0,11
    And I wait 100ms
    And I backspace-delete at position 0,10
    And I wait 100ms
    And I backspace-delete at position 0,9
    And I wait 100ms
    Then the tracked document contains "{--rld--}"
    And the tracked document contains exactly 1 deletion marker

  Scenario: Forward-delete works correctly
    # Mocha: 'backspace vs forward-delete both work correctly'
    Given a tracking-mode editor with content "Hello world"
    When I delete the character at position 0,6
    And I wait 100ms
    Then the tracked document contains "{--w--}"

  Scenario: Deletion flushes pending insertion first
    # Mocha: 'deletion flushes pending insertion first'
    Given a tracking-mode editor with content "Start here."
    When I insert "test" at the end
    And I wait 100ms
    Then the tracked document text is "Start here.test"
    When I delete the range 0,10 to 0,11
    And I wait 100ms
    Then the tracked document contains "{++test++}"
    And the tracked document contains "{--.--}"

  # === SUBSTITUTION TESTS ===

  Scenario: Substitution crystallizes immediately
    # Mocha: 'substitution crystallizes immediately as {~~old~>new~~}'
    Given a tracking-mode editor with content "Hello world"
    When I replace the range 0,6 to 0,11 with "universe"
    And I wait 100ms
    Then the tracked document contains "{~~world~>universe~~}"

  Scenario: Substitution flushes pending insertion first
    # Mocha: 'substitution flushes pending insertion first'
    Given a tracking-mode editor with content "Hello world"
    When I insert "test" at the end
    And I wait 100ms
    Then the tracked document text is "Hello worldtest"
    When I replace the range 0,0 to 0,5 with "Goodbye"
    And I wait 100ms
    Then the tracked document contains "{++test++}"
    And the tracked document contains "{~~Hello~>Goodbye~~}"

  Scenario: Multi-line substitution works correctly
    # Mocha: 'multi-line substitution works correctly'
    Given a tracking-mode editor with content "Line one\nLine two"
    When I replace the range 0,5 to 1,8 with "1\nLine 2"
    And I wait 100ms
    Then the tracked document contains "{~~one\nLine two~>1\nLine 2~~}"

  Scenario: Empty replacement is handled as deletion
    # Mocha: 'empty replacement (select + delete) is handled as deletion'
    Given a tracking-mode editor with content "Hello world"
    When I replace the range 0,6 to 0,11 with ""
    And I wait 100ms
    Then the tracked document contains "{--world--}"
    And the tracked document does not contain "{~~"

  Scenario: Substitution with CriticMarkup in old text is handled correctly
    # Mocha: 'substitution with CriticMarkup in old text is handled correctly'
    Given a tracking-mode editor with content "Test {++added++} text"
    When I replace the range 0,0 to 0,4 with "Fixed"
    And I wait 100ms
    Then the tracked document contains "{~~Test~>Fixed~~}"
    And the tracked document contains "{++added++}"

  # === PASTE DETECTION ===

  Scenario: Large text insertion detected as paste and wrapped immediately
    # Mocha: 'PASTE: large text insertion detected as paste and wrapped immediately'
    Given a tracking-mode editor with content "Start here."
    And pasteMinChars is 10
    When I insert "This is a pasted text block that is definitely more than 10 characters" at the end
    And I wait 100ms
    Then the tracked document contains "{++This is a pasted text block that is definitely more than 10 characters++}"

  Scenario: Small text insertion treated as typing (stays pending)
    # Mocha: 'PASTE: small text insertion (< 10 chars) treated as typing'
    Given a tracking-mode editor with content "Start here."
    And pasteMinChars is 10
    When I insert "small" at the end
    And I wait 100ms
    Then the tracked document text is "Start here.small"
    When I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "{++small++}"

  Scenario: Pending insertion flushed before paste
    # Mocha: 'PASTE: pending insertion flushed before paste'
    Given a tracking-mode editor with content "Start here."
    And pasteMinChars is 10
    When I insert "typed" at the end
    And I wait 100ms
    Then the tracked document text is "Start here.typed"
    When I insert "This is pasted content that is longer than 10 characters" at the end
    And I wait 200ms
    Then the tracked document contains "{++typed++}"
    And the tracked document contains "{++This is pasted content that is longer than 10 characters++}"

  Scenario: Multi-change operation flushes pending edit
    # Mocha: 'PASTE: multi-change operation flushes pending edit'
    Given a tracking-mode editor with content "Start here."
    When I insert "typed" at the end
    And I wait 100ms
    Then the tracked document text is "Start here.typed"
    When I apply a multi-change edit
    And I wait 200ms
    Then the tracked document contains "{++typed++}"
