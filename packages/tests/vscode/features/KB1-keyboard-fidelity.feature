@slow @KB1 @fixture(kb-spike) @destructive
Feature: High-fidelity keyboard input in tracking mode
  As a document author with tracking enabled
  I want my typed characters, backspaces, and deletions tracked accurately
  So that every edit I make is faithfully recorded as CriticMarkup

  Background:
    Given I open "kb-spike.md" in VS Code
    And the editor is reset to the fixture
    And the ChangeTracks extension is active
    And tracking mode is definitely enabled

  # ── Smoke test: does Playwright keyboard.type() work at all? ──

  Scenario: Consecutive typed characters coalesce into a single insertion
    When I position the cursor at the end of line 15
    And I type "hello" character by character
    And I wait for the pause threshold
    Then the document contains "{++hello++}"
    And the document contains exactly 1 new insertion(s)

  Scenario: Single backspace on plain text wraps the deleted character
    When I set the cursor to line 6 column 13
    And I press "Backspace"
    And I wait for crystallization
    Then the document contains "{--l--}"

  Scenario: Multiple rapid backspaces coalesce into a single deletion
    When I set the cursor to line 6 column 12
    And I press "Backspace" 3 times with 50ms gaps
    And I wait for crystallization
    Then the document contains exactly 1 new deletion(s)

  # ── Insertion coalescing ────────────────────────────────

  Scenario: Typing then pausing then typing creates two separate insertions
    When I position the cursor at the end of line 15
    And I type "first" character by character
    And I wait for the pause threshold
    And I type "second" character by character
    And I wait for the pause threshold
    Then the document contains "{++first++}"
    And the document contains "{++second++}"

  # ── Cursor movement flushes pending ─────────────────────

  Scenario: Arrow key movement flushes pending insertion
    When I position the cursor at the end of line 15
    And I type "pending" character by character
    And I press "ArrowLeft" 20 times
    Then the document contains "{++pending++}"

  Scenario: Clicking elsewhere flushes pending insertion
    When I position the cursor at the end of line 15
    And I type "clicked" character by character
    And I click at line 3 column 1
    Then the document contains "{++clicked++}"

  # ── Backspace behavior ─────────────────────────────────

  Scenario: Backspace after typing flushes the insertion first
    When I position the cursor at the end of line 15
    And I type "test" character by character
    And I press "Backspace"
    And I wait for crystallization
    Then the document contains "{++tes++}"

  # ── Forward delete behavior ────────────────────────────

  Scenario: Forward delete wraps the character ahead of cursor
    When I set the cursor to line 6 column 6
    And I press "Delete"
    And I wait for crystallization
    Then the document contains "{--r--}"

  Scenario: Multiple forward deletes coalesce into a single deletion
    When I set the cursor to line 6 column 5
    And I press "Delete" 3 times with 50ms gaps
    And I wait for crystallization
    Then the document contains exactly 1 new deletion(s)

  # ── Typing at markup boundaries ────────────────────────

  Scenario: Typing immediately after an existing insertion
    When I position the cursor right after "{++This was previously inserted.++}"
    And I type "more" character by character
    And I wait for the pause threshold
    Then the document contains "{++more++}"
    And "{++This was previously inserted.++}" remains unchanged

  Scenario: Typing immediately before an existing insertion
    When I position the cursor right before "{++This was previously inserted.++}"
    And I type "prefix" character by character
    And I wait for the pause threshold
    Then the document contains "{++prefix++}"
    And "{++This was previously inserted.++}" remains unchanged

  Scenario: Typing between a deletion and surrounding text
    When I position the cursor right after "{--a deleted phrase--}"
    And I type "new text" character by character
    And I wait for the pause threshold
    Then the document contains "{++new text++}"

  # ── Selection + type (substitution) ────────────────────

  Scenario: Selecting text and typing replaces it with a substitution
    When I select "untouched" on line 6
    And I type "modified"
    And I wait for crystallization
    Then the document contains "{~~untouched~>modified~~}"

  Scenario: Selecting text and pressing Backspace creates a deletion
    When I select "sentences" on line 6
    And I press "Backspace"
    And I wait for crystallization
    Then the document contains "{--sentences--}"

  # ── Enter key / newline ────────────────────────────────

  Scenario: Pressing Enter inserts a tracked newline
    When I set the cursor to line 6 column 20
    And I press "Enter"
    And I wait for the pause threshold
    Then the document text contains a tracked newline insertion

  # ── breakOnNewline setting ─────────────────────────────

  Scenario: Enter splits pending insertion when breakOnNewline is enabled
    Given the setting "editBoundary.breakOnNewline" is true
    When I position the cursor at the end of line 15
    And I type "before" character by character
    And I press "Enter"
    And I type "after" character by character
    And I wait for the pause threshold
    Then the document contains "{++before++}"
    And the document contains "{++after++}"
    And "{++before++}" appears before "{++after++}"

  Scenario: Enter does not split pending insertion when breakOnNewline is disabled
    Given the setting "editBoundary.breakOnNewline" is false
    When I position the cursor at the end of line 15
    And I type "before" character by character
    And I press "Enter"
    And I type "after" character by character
    And I wait for the pause threshold
    Then the document text matches insertion containing "before" and "after"

  # ── Pause threshold variations ─────────────────────────

  Scenario: Very short pause threshold crystallizes quickly
    Given the pause threshold is 500ms
    When I position the cursor at the end of line 15
    And I type "fast" character by character
    And I wait 1000 milliseconds
    Then the document contains "{++fast++}"

  Scenario: Zero pause threshold means no auto-crystallize
    Given the pause threshold is 0ms
    When I position the cursor at the end of line 15
    And I type "pending" character by character
    And I wait 2000 milliseconds
    Then the document does not contain "{++pending++}"
    When I press "ArrowUp"
    Then the document contains "{++pending++}"

  # ── Paste detection ────────────────────────────────────

  Scenario: Pasting text above pasteMinChars crystallizes immediately
    When I position the cursor at the end of line 15
    And I paste "This is a long enough string that exceeds the paste threshold for immediate crystallization" into the editor
    And I wait for crystallization
    Then the document contains "{++This is a long enough string"
    And the document contains exactly 1 new insertion(s)

  # ── Undo / redo ────────────────────────────────────────

  Scenario: Undo reverses a tracked insertion
    When I position the cursor at the end of line 15
    And I type "undome" character by character
    And I wait for the pause threshold
    And I press "Meta+z" 10 times
    Then the document does not contain "undome"
    And the document does not contain "{++undome++}"

  Scenario: Redo restores a tracked insertion after undo
    When I position the cursor at the end of line 15
    And I type "redome" character by character
    And I wait for the pause threshold
    And I press "Meta+z" 10 times
    And I press "Meta+Shift+z" 10 times
    Then the document contains "redome"
