@slow @KB3 @fixture(kb3-existing-prose) @destructive
Feature: Realistic typing session — drafting alongside existing text
  As a document author adding new content to an existing document
  I want edits to existing text and new additions both tracked accurately
  So that changes to existing content and new content are distinguishable

  # Journey: Add new paragraphs at the end, then go back and revise
  # existing text — substitutions, deletions, insertions within existing prose.
  # Tests interleaving of tracked new content with edits to untracked existing text.

  Background:
    Given I open "kb3-existing-prose.md" in VS Code
    And the editor is reset to the fixture
    And the ChangeDown extension is active
    And tracking mode is definitely enabled

  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Default pause threshold (2000ms)
  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scenario: Adding new content and revising existing text with default threshold
    # ── Phase 1: Navigate to end of last paragraph, type new content ──
    When I position the cursor at the end of line 10
    And I press "Enter"
    And I press "Enter"
    And I type "In addition to documentation, code reviews serve as a knowledge transfer mechanism." character by character
    And I wait for the pause threshold

    # Checkpoint 1: new content tracked, existing text untouched
    Then the document contains "code reviews serve as a knowledge transfer"
    And the document contains "Software architecture is the high-level structure"

    # ── Phase 2: Continue typing, pause mid-thought, continue ──
    When I type " Regular reviews help maintain" character by character
    And I wait for the pause threshold
    And I type " consistent quality across the entire project." character by character
    And I wait for the pause threshold

    # Checkpoint 2: pause between thoughts creates separate tracked content
    Then the document contains "Regular reviews help maintain"
    And the document contains "consistent quality across the entire project."

    # ── Phase 3: Go back to existing paragraph 2, replace a word ──
    When I select the text "Good" and type "Sound"
    And I wait for crystallization

    # Checkpoint 3: substitution in existing text
    Then the document contains "{~~Good~>Sound~~}"
    # New content at end is still intact
    And the document contains "code reviews serve"

    # ── Phase 4: Delete a word in paragraph 1 ──
    When I position the cursor right before "principles"
    And I press "Alt+Shift+ArrowRight"
    And I press "Backspace"
    And I wait for crystallization

    # Checkpoint 4: word deletion in paragraph 1
    Then the document contains "{--principles--}"

    # ── Phase 5: Type replacement text (longer than deleted) ──
    When I type "guidelines" character by character
    And I wait for the pause threshold

    # Checkpoint 5: insertion right after the deletion
    Then the document contains "{++guidelines++}"
    And "{--principles--}" appears before "{++guidelines++}"

    # ── Phase 6: Insert between existing paragraphs ──
    When I position the cursor right after "full impact of their modifications."
    And I type " Automated testing complements manual review." character by character
    And I wait for the pause threshold

    # Checkpoint 6: insertion within existing content
    Then the document contains "Automated testing complements manual review."

    # ── Phase 7: Select and delete a sentence in our new content ──
    When I select the text "Regular reviews help maintain"
    And I press "Backspace"
    And I wait for crystallization

    # Checkpoint 7: deletion of own recently-tracked content
    Then the document contains "{--Regular reviews help maintain--}"

    # ── Phase 8: Type replacement sentence ──
    When I type "Frequent peer reviews also help maintain" character by character
    And I wait for the pause threshold

    # Checkpoint 8: new insertion replaces the deleted content
    Then the document contains "{++Frequent peer reviews also help maintain++}"

    # ── Phase 9: Select a word in existing paragraph 4, replace it ──
    When I select the text "quickly" and type "efficiently"
    And I wait for crystallization

    # Checkpoint 9: substitution in existing paragraph
    Then the document contains "{~~quickly~>efficiently~~}"

  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  # Manual flush only (0ms)
  # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Scenario: Adding new content and revising with manual flush only
    Given the pause threshold is 0ms

    # ── Phase 1: Type at end of last paragraph — stays pending ──
    When I position the cursor at the end of line 10
    And I type " New content that stays pending." character by character
    And I wait 2500 milliseconds

    Then the document does not contain "{++New content"

    # ── Phase 2: Navigate away flushes the pending insertion ──
    When I press "Meta+ArrowUp"
    And I wait for crystallization
    Then the document contains "New content that stays pending."

    # ── Phase 3: Select-replace, then navigate to flush (0ms = manual) ──
    When I select the text "high-level" and type "top-level"
    And I press "ArrowDown"
    And I wait for crystallization

    Then the document contains "{~~high-level~>top-level~~}"
