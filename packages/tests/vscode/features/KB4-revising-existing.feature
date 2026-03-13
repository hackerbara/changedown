@slow @KB4 @fixture(kb4-revision-target) @destructive
Feature: Realistic typing session — revising existing content
  As a document author revising an existing document
  I want all my edits faithfully tracked as I navigate and modify text
  So that the full revision history is captured as CriticMarkup

  # Journey: Pure revision — no new paragraphs. Navigate throughout the document
  # making substitutions, deletions, insertions, word-level and line-level edits.
  # Tests distant cursor jumps, word-by-word navigation, multi-line selection.

  Background:
    Given I open "kb4-revision-target.md" in VS Code
    And the editor is reset to the fixture
    And the ChangeTracks extension is active
    And tracking mode is definitely enabled

  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Default pause threshold (2000ms)
  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scenario: Full document revision with default pause threshold
    # ── Phase 1: Navigate to paragraph 2, select and replace a word ──
    When I select the text "significant" and type "substantial"
    And I wait for crystallization

    # Checkpoint 1: substitution in paragraph 1
    Then the document contains "{~~significant~>substantial~~}"

    # ── Phase 2: Word-by-word navigation, insert a phrase ──
    When I position the cursor right after "load well."
    And I type " Under peak conditions, the system maintained full throughput." character by character
    And I wait for the pause threshold

    # Checkpoint 2: insertion inside paragraph 2
    # Note: leading space is NOT tracked — controller skips standalone whitespace
    # when no pending edit exists (controller.ts:1225). The space appears as plain text
    # before the insertion markup.
    Then the document contains "{++Under peak conditions, the system maintained full throughput.++}"

    # ── Phase 3: Move to paragraph 3, delete a word via Option+Backspace ──
    When I position the cursor right after "several areas"
    And I press "Alt+Backspace"
    And I wait for crystallization

    # Checkpoint 3: word deletion via Option+Backspace
    Then the document contains "{--areas--}"

    # ── Phase 4: Type replacement word ──
    When I type "opportunities" character by character
    And I wait for the pause threshold

    # Checkpoint 4: insertion right after deletion
    Then the document contains "{++opportunities++}"
    And "{--areas--}" appears before "{++opportunities++}"

    # ── Phase 5: Jump to document start, insert at the beginning ──
    When I press "Meta+ArrowUp"
    And I position the cursor right after "# Project Status Report"
    And I press "Enter"
    And I type "Quarterly Review — Q1 2026" character by character
    And I wait for the pause threshold

    # Checkpoint 5: insertion at document start
    Then the document contains "{++Quarterly Review"

    # ── Phase 6: Jump to end, add closing sentence ──
    When I press "Meta+ArrowDown"
    And I type " We remain on track for the planned release date." character by character
    And I wait for the pause threshold

    # Checkpoint 6: insertion at document end
    # Leading space skipped (standalone whitespace, no pending edit)
    Then the document contains "{++We remain on track for the planned release date.++}"

    # ── Phase 7: Select an entire sentence in paragraph 4, replace it ──
    When I select the text "Session management follows current best practices." and type "Token-based session management provides enhanced security guarantees."
    And I wait for crystallization

    # Checkpoint 7: full sentence substitution
    Then the document contains "{~~Session management follows current best practices.~>Token-based session management provides enhanced security guarantees.~~}"

    # ── Phase 8: Navigate to paragraph 1, delete with backspace ──
    When I position the cursor right after "initial implementation"
    And I press "Backspace" 14 times with 50ms gaps
    And I wait for crystallization

    # Checkpoint 8: multi-character backspace deletion
    Then the document contains "{--implementation--}"

    # ── Phase 9: Type replacement ──
    When I type "deployment" character by character
    And I wait for the pause threshold

    Then the document contains "{++deployment++}"

    # ── Phase 10: Select across a line boundary and delete ──
    When I position the cursor right before "Memory usage"
    And I press "Shift+ArrowDown"
    And I press "Shift+End"
    And I press "Backspace"
    And I wait for crystallization

    # Checkpoint 10: multi-line deletion
    Then the document does not contain "Memory usage remains stable"

    # ── Phase 11: Paste replacement text ──
    When I paste "Resource utilization stays within acceptable bounds throughout all tested scenarios." into the editor
    And I wait for crystallization

    # Checkpoint 11: paste tracked
    Then the document contains "{++Resource utilization stays within acceptable bounds"

    # ── Phase 12: Undo last paste ──
    When I press "Meta+z" 5 times
    Then the document does not contain "Resource utilization"

    # ── Phase 13: Redo to restore ──
    When I press "Meta+Shift+z" 5 times
    Then the document contains "Resource utilization"

  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Manual flush only (0ms)
  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scenario: Full document revision with manual flush only
    Given the pause threshold is 0ms

    # ── Phase 1: Select and replace — navigate away to flush (0ms = no timer) ──
    When I select the text "significant" and type "notable"
    And I press "ArrowDown"
    And I wait for crystallization

    # With 0ms threshold, substitutions need cursor-move flush (no timer)
    Then the document contains "{~~significant~>notable~~}"

    # ── Phase 2: Type an insertion — stays pending ──
    When I position the cursor right after "external systems."
    And I type " The results exceeded expectations." character by character
    And I wait 2500 milliseconds

    # Leading space is skipped (standalone whitespace, no pending edit)
    Then the document does not contain "{++The results exceeded expectations.++}"

    # ── Phase 3: Navigate away flushes pending ──
    When I position the cursor right before "Error handling"

    Then the document contains "{++The results exceeded expectations.++}"

    # ── Phase 4: Delete a word — navigate to flush (0ms = no timer) ──
    When I press "Alt+Shift+ArrowRight"
    And I press "Alt+Shift+ArrowRight"
    And I press "Backspace"
    And I press "ArrowDown"
    And I wait for crystallization

    # With 0ms threshold, deletions also need cursor-move flush
    Then the document contains "{--Error handling--}"

    # ── Phase 5: Type replacement, then navigate to flush ──
    When I type "Exception handling" character by character
    And I press "ArrowDown"

    Then the document contains "{++Exception handling++}"

    # ── Phase 6: Multiple rapid edits at different locations ──
    When I select the text "positive" and type "encouraging"
    And I press "ArrowDown"
    And I wait for crystallization

    Then the document contains "{~~positive~>encouraging~~}"

    When I select the text "scalability" and type "performance"
    And I press "ArrowDown"
    And I wait for crystallization

    Then the document contains "{~~scalability~>performance~~}"
