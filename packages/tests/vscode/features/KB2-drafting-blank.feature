@slow @KB2 @fixture(kb2-blank-draft) @destructive
Feature: Realistic typing session — drafting from blank document
  As a document author starting from a blank document
  I want my entire drafting session faithfully tracked
  So that every insertion, deletion, and correction is recorded as CriticMarkup

  # Journey: Type paragraphs, fix typos, navigate back to edit, paste, undo/redo.
  # Validates intermediate state at natural human pauses.
  #
  # DESIGN NOTES:
  # - Enter presses create tracked newline insertions with footnotes
  # - Cursor positioning "right after" a string inside {++...++} lands INSIDE the
  #   block, so subsequent typing extends the existing insertion
  # - All typed text in a blank document is INSIDE {++...++} blocks — substitution
  #   ({~~old~>new~~}) does not apply; only insertions and deletions
  # - Option+Backspace (Alt+Backspace) deletes the previous word

  Background:
    Given I open "kb2-blank-draft.md" in VS Code
    And the editor is reset to the fixture
    And the ChangeDown extension is active
    And tracking mode is definitely enabled

  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Default pause threshold (2000ms) — pauses between thoughts crystallize
  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scenario: Drafting a document from blank with default pause threshold
    # ── Phase 1: Type the first sentence ──
    When I position the cursor at the end of line 2
    And I press "Enter"
    And I press "Enter"
    And I type "The quick brown fox jumps over the lazy dog." character by character
    And I wait for the pause threshold

    # Checkpoint 1: first sentence tracked as insertion
    Then the document contains "{++The quick brown fox jumps over the lazy dog.++}"

    # ── Phase 2: Continue typing, notice typo immediately, fix with backspace ──
    When I type " It was a beautifal" character by character
    # Oops — "beautifal" is wrong. Backspace 2 chars ("al") then retype "ul"
    And I press "Backspace" 2 times with 50ms gaps
    And I type "ul day in the park." character by character
    And I wait for the pause threshold

    # Checkpoint 2: the corrected sentence is tracked (backspaces within pending buffer)
    Then the document contains "beautiful day in the park."
    And the document does not contain "beautifal"

    # ── Phase 3: New paragraph ──
    When I press "Enter"
    And I press "Enter"
    And I type "Meanwhile, across town, the rain began to fall steadily." character by character
    And I wait for the pause threshold

    # Checkpoint 3: second paragraph tracked
    Then the document contains "Meanwhile, across town"

    # ── Phase 4: Continue typing a second sentence in the paragraph ──
    When I type " The streets glistened under the amber glow of the streetlights." character by character
    And I wait for the pause threshold

    # Checkpoint 4: second sentence tracked
    Then the document contains "streetlights."

    # ── Phase 5: Go back to paragraph 1, insert a forgotten phrase ──
    When I press "Meta+ArrowUp"
    And I position the cursor right after "lazy dog."
    And I type " What a sight!" character by character
    And I wait for the pause threshold

    # Checkpoint 5: text inserted (extends existing insertion or creates new one)
    Then the document contains "What a sight!"
    And the document contains "Meanwhile, across town"

    # ── Phase 6: Jump back to end, type more ──
    When I press "Meta+ArrowDown"
    And I type " Puddles formed at every corner." character by character
    And I wait for the pause threshold

    # Checkpoint 6: new text at end
    Then the document contains "Puddles formed"

    # ── Phase 7: Delete last word with Option+Backspace, type replacement ──
    When I press "Alt+Backspace"
    And I wait for crystallization
    And I type "intersection." character by character
    And I wait for the pause threshold

    # Checkpoint 7: deletion + insertion
    Then the document contains "intersection."

    # ── Phase 8: Paste a sentence ──
    When I press "Meta+ArrowDown"
    And I paste "This concluding sentence was pasted from the clipboard to test paste detection behavior." into the editor
    And I wait for crystallization

    # Checkpoint 8: paste crystallized immediately
    Then the document contains "{++This concluding sentence was pasted"

    # ── Phase 9: Undo and redo the paste ──
    When I press "Meta+z" 10 times
    Then the document does not contain "This concluding sentence was pasted"

    When I press "Meta+Shift+z" 10 times
    Then the document contains "This concluding sentence was pasted"

  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Manual flush only (0ms) — edits crystallize on cursor movement
  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scenario: Drafting from blank with manual flush only
    Given the pause threshold is 0ms

    # ── Phase 1: Type at end of document — stays pending ──
    When I position the cursor at the end of line 3
    And I type "Pending text stays uncrystallized." character by character
    And I wait 2500 milliseconds

    # With 0ms threshold, nothing crystallizes automatically
    Then the document does not contain "{++Pending text"

    # ── Phase 2: Navigate away to flush ──
    When I press "Meta+ArrowUp"
    And I wait for crystallization
    Then the document contains "{++Pending text stays uncrystallized.++}"

    # ── Phase 3: Type at a stable position (title line), navigate to flush ──
    When I position the cursor at the end of line 2
    And I type "Draft notes here." character by character
    And I wait 2500 milliseconds

    # Still pending (0ms threshold, no auto-crystallize)
    Then the document does not contain "{++Draft notes here.++}"

    When I press "Meta+ArrowUp"
    And I wait for crystallization
    Then the document contains "{++Draft notes here.++}"

    # Phases 1-3 prove: (a) 0ms threshold prevents auto-crystallization,
    # (b) keyboard navigation triggers cursor-move flush,
    # (c) repeated type-navigate-verify cycle works reliably.
