@integration @EB2
Feature: Pending/committed lifecycle — flush, merge, race conditions, save
  As a document author using tracking mode
  I want edits flushed reliably on save, cursor move, and timer
  So my tracked changes are never lost or corrupted

  # -----------------------------------------------------------------------
  # TIER DECISION: @integration (NOT @fast)
  #
  # Same rationale as EB1. These tests exercise:
  #   - Document save lifecycle (vscode.workspace.fs, onDidSaveTextDocument)
  #   - Real timer races (multiple setTimeout interactions)
  #   - VS Code editor.edit() concurrency
  #   - Shadow state consistency across rapid VS Code document mutations
  #   - File-backed document creation and cleanup
  # -----------------------------------------------------------------------

  # === DOCUMENT SAVE FLUSH ===

  Scenario: Pending insertion is flushed when document is saved
    # Mocha: 'pending insertion is flushed when document is saved'
    Given a tracking-mode editor with file-backed content "Start here."
    When I insert "test" at the end
    And I wait 100ms
    And I save the document
    Then the tracked document contains "{++test++}"

  Scenario: Saved document contains complete CriticMarkup, not unwrapped text
    # Mocha: 'saved document contains complete CriticMarkup, not unwrapped text'
    Given a tracking-mode editor with file-backed content "Start here."
    When I insert "hello" at the end
    And I wait 100ms
    And I save the document
    Then the saved file contains "{++hello++}"
    And the saved file does not contain unwrapped "Start here.hello"

  Scenario: Flush happens synchronously before save completes
    # Mocha: 'flush happens synchronously before save completes'
    Given a tracking-mode editor with file-backed content "Start here."
    When I insert "sync" at the end
    And I wait 100ms
    And I save the document and capture text at save event
    Then the text captured at save time contains "{++sync++}"

  Scenario: Tracking mode state is preserved after save
    # Mocha: 'tracking mode state is preserved after save'
    Given a tracking-mode editor with file-backed content "Start here."
    When I insert "preserve" at the end
    And I wait 100ms
    And I save the document
    And I wait 100ms
    And I insert " more" at the end
    And I move the cursor to position 0,0
    And I wait 100ms
    Then the tracked document contains "{++"
    And the tracked document contains " more"

  Scenario: Save does nothing if no pending insertion exists
    # Mocha: 'save does nothing if no pending insertion exists'
    Given a tracking-mode editor with file-backed content "Start here."
    When I save the document
    Then the tracked document text is "Start here."

  Scenario: Save only flushes if tracking mode is enabled
    # Mocha: 'save only flushes if tracking mode is enabled'
    Given an editor with file-backed content "Start here."
    # Note: tracking mode is NOT enabled
    When I insert "untracked" at the end
    And I wait 100ms
    And I save the document
    Then the tracked document text is "Start here.untracked"
    And the tracked document does not contain "{++"

  Scenario: Save only flushes markdown documents
    # Mocha: 'save only flushes markdown documents'
    Given a tracking-mode editor with file-backed plain-text content "Plain text"
    When I insert " test" at the end
    And I wait 100ms
    And I save the document
    Then the tracked document text is "Plain text test"
    And the tracked document does not contain "{++"

  # === CONSECUTIVE COMMITTED EDIT MERGING ===

  Scenario: Adjacent insertions stay separate with Level 1 tracking (each gets unique cn-ID)
    # Mocha: 'adjacent insertions stay separate with Level 1 tracking (each gets unique cn-ID)'
    # Types "hello", waits for timer. Types " world", waits for timer.
    # Level 1: each insertion has cn-ID, so no merge.
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "hello" at the end
    And I wait 2400ms
    Then the tracked document contains "{++hello++}"
    When I insert " world" at the end
    And I wait 2400ms
    Then the tracked document contains "{++hello++}"
    And the tracked document contains "{++ world++}"
    And the tracked document contains exactly 2 insertion markers
    And the tracked document contains at least 2 footnote refs

  Scenario: Merging only happens for same type (insertion stays separate from deletion)
    # Mocha: 'merging only happens for same type (insertion stays separate from deletion)'
    Given a tracking-mode editor with content "Hello world"
    When I insert " test" at the end
    And I move the cursor to position 0,0
    And I wait 100ms
    Then the tracked document contains "{++ test++}"
    When I delete the character at position 0,0
    And I wait 100ms
    Then the tracked document contains "{++ test++}"
    And the tracked document contains "{--H--}"
    And the tracked document contains exactly 1 insertion marker
    And the tracked document contains exactly 1 deletion marker

  Scenario: Non-adjacent edits stay separate (Level 1: all edits stay separate)
    # Mocha: 'non-adjacent edits stay separate (Level 1: all edits stay separate)'
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "first" at the end
    And I wait 2400ms
    Then the tracked document contains "{++first++}"
    When I insert " gap " at the end
    And I wait 2400ms
    Then the tracked document contains "{++first++}"
    And the tracked document contains "{++ gap ++}"
    When I insert "second" at the beginning
    And I wait 2400ms
    Then the tracked document contains "{++second++}"
    And the tracked document contains "{++first++}"
    And the tracked document contains "{++ gap ++}"
    And the tracked document contains exactly 3 insertion markers

  Scenario: Level 1 tracking preserves text content in separate insertions
    # Mocha: 'Level 1 tracking preserves text content in separate insertions'
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "Hello" at the end
    And I wait 2400ms
    And I insert " World!" at the end
    And I wait 2400ms
    Then the tracked document contains "{++Hello++}"
    And the tracked document contains "{++ World!++}"
    And the tracked document contains at least 2 footnote refs

  Scenario: Different types do not merge (insertion + deletion stays separate)
    # Mocha: 'different types do not merge (insertion + deletion stays separate)'
    Given a tracking-mode editor with content "Test text"
    When I insert " added" at the end
    And I move the cursor to position 0,0
    And I wait 100ms
    And I delete the character at position 0,0
    And I wait 100ms
    Then the tracked document contains "{++ added++}"
    And the tracked document contains "{--T--}"
    And the tracked document contains exactly 1 insertion marker
    And the tracked document contains exactly 1 deletion marker

  Scenario: Adjacent deletions merge
    # Mocha: 'adjacent deletions merge: {--a--}{--b--} -> {--ab--}'
    Given a tracking-mode editor with content "abcdef"
    When I backspace-delete at position 0,6
    And I wait 100ms
    And I backspace-delete at position 0,5
    And I wait 100ms
    Then the tracked document contains "{--ef--}"
    And the tracked document contains exactly 1 deletion marker

  # === RACE CONDITION TESTS ===

  Scenario: RACE: rapid typing does not cause state corruption
    # Mocha: 'RACE: rapid typing does not cause state corruption'
    Given a tracking-mode editor with content "Start here."
    When I rapidly insert "a", "b", "c", "d", "e" at the end
    And I wait 200ms
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "abcde"
    And the tracked document contains "{++abcde++}"
    And the tracked document contains exactly 1 insertion marker

  Scenario: RACE: concurrent cursor movements maintain consistency
    # Mocha: 'RACE: concurrent cursor movements maintain consistency'
    Given a tracking-mode editor with content "Start here."
    When I insert "first" at the end
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "{++first++}"
    When I insert "second" at the beginning
    And I move the cursor to a safe mid-position
    And I wait 300ms
    Then the tracked document contains "{++first++}"
    And the tracked document contains "{++second++}"
    And "{++second++}" appears before "{++first++}" in the tracked document

  Scenario: RACE: decoration update waits for tracking completion
    # Mocha: 'RACE: decoration update waits for tracking completion'
    Given a tracking-mode editor with content "Start here."
    When I insert "test" at the end
    And I insert "x" adjacent
    And I wait 200ms
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "test"
    And the tracked document contains "x"
    And the tracked document contains "{++testx++}"

  Scenario: RACE: shadow state remains consistent during rapid edits
    # Mocha: 'RACE: shadow state remains consistent during rapid edits'
    Given a tracking-mode editor with content "abcdefghij"
    When I delete the character at position 0,0
    And I wait 200ms
    Then the tracked document contains "{--a--}"
    When I delete the first unwrapped character after the deletion
    And I wait 200ms
    Then the tracked document contains "{--a--}"
    And the tracked document contains "{--b--}"
    When I insert "xyz" at the end
    And I move the cursor to position 0,0
    And I wait 300ms
    Then the tracked document contains "{++xyz++}"
    And the tracked document contains "{--a--}"
    And the tracked document contains "{--b--}"

  Scenario: RACE: concurrent insertions do not corrupt document (Level 1: no merge)
    # Mocha: 'RACE: concurrent insertions do not corrupt document (Level 1: no merge)'
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "first" at the end
    And I wait 2400ms
    Then the tracked document contains "{++first++}"
    When I insert "second" at the end
    And I wait 3000ms
    When I insert "third" at the beginning
    And I move the cursor to a safe mid-position
    And I wait 500ms
    Then the tracked document contains "first"
    And the tracked document contains "second"
    And the tracked document contains "third"
    And the tracked document contains "{++first++}"
    And the tracked document contains "{++second++}"
    And the tracked document contains "{++third++}"
    And the tracked document contains exactly 3 insertion markers

  Scenario: RACE: flush completes before decoration updates
    # Mocha: 'RACE: flush completes before decoration updates'
    Given a tracking-mode editor with content "Start here."
    When I insert "test" at the end
    And I wait 50ms
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "{++test++}"
    And the tracked document does not contain unwrapped "test"

  Scenario: RACE: multiple rapid cursor movements with pending edit
    # Mocha: 'RACE: multiple rapid cursor movements with pending edit'
    Given a tracking-mode editor with content "Start here."
    When I insert "test" at the end
    And I rapidly move cursor to positions (0,5), (0,0), (0,2)
    And I wait 300ms
    Then the tracked document contains "{++test++}"
    And "{++test++}" appears exactly 1 time in the tracked document

  Scenario: RACE: deletion during pending insertion flush
    # Mocha: 'RACE: deletion during pending insertion flush'
    Given a tracking-mode editor with content "Hello world"
    When I insert " test" at the end
    And I delete the character at position 0,0
    And I wait 300ms
    Then the tracked document contains "{++test++}" or "{++ test++}"
    And the tracked document contains "{--H--}"

  # === SAVE TIMEOUT TESTS ===

  Scenario: TIMEOUT: save completes successfully with fast flush
    # Mocha: 'TIMEOUT: save completes successfully with fast flush'
    Given a tracking-mode editor with file-backed content "Start here."
    When I insert "fast" at the end
    And I wait 100ms
    And I save the document and measure duration
    Then the save completed in less than 1000ms
    And the tracked document contains "{++fast++}"

  Scenario: TIMEOUT: save proceeds within timeout window
    # Mocha: 'TIMEOUT: save proceeds even if flush times out (5-second limit)'
    Given a tracking-mode editor with file-backed content "Start here."
    When I insert "timeout_test" at the end
    And I wait 100ms
    And I save the document and measure duration
    Then the save completed in less than 6000ms
    And the tracked document contains "{++timeout_test++}"

  # === IME COMPOSITION TESTS ===

  Scenario: IME: composition state suppresses pause timer
    # Mocha: 'IME: composition state suppresses pause timer'
    # Note: VS Code test environment does not support real IME events.
    # The mocha test verifies that without composition, the timer fires normally.
    # This scenario documents the expected behavior.
    Given a tracking-mode editor with content "Start here."
    And the pause threshold is 2000ms
    When I insert "test" at the end
    And I wait 2400ms
    Then the tracked document contains "{++test++}"

  Scenario: IME: never flush during active composition
    # Mocha: 'IME: never flush during active composition'
    # Without real IME, this test verifies cursor-move flush still works.
    Given a tracking-mode editor with content "Start here."
    When I insert "composition" at the end
    And I wait 100ms
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "{++composition++}"

  Scenario: IME: flush occurs after composition ends
    # Mocha: 'IME: flush occurs after composition ends'
    # Without real IME, this verifies post-typing flush behavior.
    Given a tracking-mode editor with content "Start here."
    When I insert "composed" at the end
    And I wait 100ms
    And I move the cursor to position 0,0
    And I wait 200ms
    Then the tracked document contains "{++composed++}"
