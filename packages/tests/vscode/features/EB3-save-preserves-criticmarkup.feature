@integration @EB3 @destructive
Feature: Save preserves CriticMarkup — panel state interaction bug
  As a document author using ChangeTracks
  I want CriticMarkup to survive document save operations across all state transitions
  So my tracked changes and review feedback are never silently lost

  # -----------------------------------------------------------------------
  # BUG REPORT (2026-03-01):
  #
  # User had a tracked file open with a CriticMarkup comment (added via
  # MCP plugin). When they saved the file, the comment was completely
  # stripped — not compacted to footnotes, just gone. The panel showed
  # "tracking changes is on" throughout.
  #
  # TIER: @integration (requires VS Code Extension Host, file system,
  # Playwright for panel state queries, real document save lifecycle)
  # -----------------------------------------------------------------------

  # ===================================================================
  # PART 1: BLANK FILE JOURNEY — no existing CriticMarkup
  # ===================================================================

  # --- 1A: Blank file, tracking OFF, insert comment, save ---

  Scenario: Blank file — comment inserted with tracking OFF is preserved on save
    Given a blank file-backed markdown document
    And the panel shows tracking is disabled
    When I add a comment "review note" highlighting "content" in the document
    And I wait 500ms
    Then the live document contains "{=="
    And the live document contains "{>>"
    When I press Cmd+S to save
    Then the on-disk file contains "{=="
    And the on-disk file contains "{>>"
    And the on-disk file contains "review note"

  Scenario: Blank file — comment with footnote inserted with tracking OFF survives save
    Given a blank file-backed markdown document
    And the panel shows tracking is disabled
    When I add a footnoted comment "feedback here" highlighting "content" in the document
    And I wait 500ms
    Then the live document contains "[^ct-"
    When I press Cmd+S to save
    Then the on-disk file contains "[^ct-"
    And the on-disk file contains "feedback here"

  # --- 1B: Blank file, tracking OFF, insert comment, save, THEN turn tracking ON ---

  Scenario: Blank file — comment survives save then tracking toggle ON
    Given a blank file-backed markdown document
    And the panel shows tracking is disabled
    When I add a comment "first feedback" highlighting "content" in the document
    And I wait 500ms
    And I press Cmd+S to save
    Then the on-disk file contains "first feedback"
    When I click the Tracking toggle
    And I wait 500ms
    Then the panel shows tracking is enabled
    And the live document contains "first feedback"
    When I press Cmd+S to save
    Then the on-disk file contains "first feedback"
    And the on-disk file contains "{=="
    And the on-disk file contains "{>>"

  Scenario: Blank file — comment preserved across tracking OFF → ON → OFF → save
    Given a blank file-backed markdown document
    And the panel shows tracking is disabled
    When I add a comment "persistent note" highlighting "content" in the document
    And I wait 500ms
    And I press Cmd+S to save
    And I click the Tracking toggle
    And I wait 500ms
    And I click the Tracking toggle
    And I wait 500ms
    And I press Cmd+S to save
    Then the on-disk file contains "persistent note"
    And the on-disk file contains "{=="

  # --- 1C: Blank file, tracking ON from start ---

  Scenario: Blank file — turn tracking ON first, type text, save preserves markup
    Given a blank file-backed markdown document
    When I click the Tracking toggle
    And I wait 500ms
    Then the panel shows tracking is enabled
    When I type "hello world" into the editor
    And I wait 500ms
    And I position the cursor at line 0 column 0
    And I wait 500ms
    And I press Cmd+S to save
    Then the on-disk file contains "{++hello world++}"

  Scenario: Blank file — tracking ON, add comment, save preserves both
    Given a blank file-backed markdown document
    When I click the Tracking toggle
    And I wait 500ms
    And I add a comment "tracking comment" highlighting "content" in the document
    And I wait 500ms
    And I press Cmd+S to save
    Then the on-disk file contains "tracking comment"
    And the on-disk file contains "{=="
    And the on-disk file contains "{>>"

  # ===================================================================
  # PART 2: FILE WITH EXISTING CRITICMARKUP — preservation on save
  # ===================================================================

  Scenario: Existing CriticMarkup — save preserves all inline markup types
    Given a tracked file-backed document with CriticMarkup
    And the panel shows tracking is enabled
    When I press Cmd+S to save
    Then the on-disk file contains "{++Rate limiting is enabled for all public endpoints.++}"
    And the on-disk file contains "{~~session cookies~>OAuth2 with JWT~~}"
    And the on-disk file contains "{--The legacy SOAP API will remain available indefinitely.--}"
    And the on-disk file contains "{==highlighted section==}"
    And the on-disk file contains "{>> This is review feedback <<}"

  Scenario: Existing CriticMarkup — save preserves all footnotes
    Given a tracked file-backed document with CriticMarkup
    When I press Cmd+S to save
    Then the on-disk file contains "[^ct-1]"
    And the on-disk file contains "[^ct-2]"
    And the on-disk file contains "[^ct-3]"
    And the on-disk file contains "[^ct-4]"
    And the on-disk file contains "Added rate limiting to prevent abuse"
    And the on-disk file contains "Review feedback on highlighted section"

  Scenario: Existing CriticMarkup — save preserves tracking header
    Given a tracked file-backed document with CriticMarkup
    When I press Cmd+S to save
    Then the on-disk file contains "<!-- ctrcks.com/v1: tracked -->"

  # ===================================================================
  # PART 3: PANEL STATE TRANSITIONS — toggle tracking, then save
  # ===================================================================

  Scenario: Toggle tracking ON then OFF then save — existing markup preserved
    Given a tracked file-backed document with CriticMarkup
    And the panel shows tracking is enabled
    When I click the Tracking toggle
    And I wait 500ms
    Then the panel shows tracking is disabled
    When I click the Tracking toggle
    And I wait 500ms
    Then the panel shows tracking is enabled
    When I press Cmd+S to save
    Then the on-disk file contains "{++Rate limiting is enabled for all public endpoints.++}"
    And the on-disk file contains "{>> This is review feedback <<}"
    And the on-disk file contains "[^ct-4]"

  Scenario: Panel tracking state matches controller after toggle cycle
    Given a tracked file-backed document with CriticMarkup
    When I click the Tracking toggle
    And I wait 500ms
    And I click the Tracking toggle
    And I wait 500ms
    Then the panel shows tracking is enabled
    And the controller state shows tracking is enabled

  Scenario: Settings panel interaction then document save preserves markup
    Given a tracked file-backed document with CriticMarkup
    And the panel shows tracking is enabled
    When I open the Settings Panel
    And I wait 500ms
    And I press Cmd+S to save
    Then the on-disk file contains "{++Rate limiting is enabled for all public endpoints.++}"
    And the on-disk file contains "{>> This is review feedback <<}"
    And the on-disk file contains "[^ct-4]"

  # ===================================================================
  # PART 4: EXTERNAL EDIT (MCP TOOL) — write CriticMarkup to file on disk
  # ===================================================================

  Scenario: External CriticMarkup addition is preserved after VS Code save
    Given a blank file-backed markdown document with tracking header
    And the panel shows tracking is enabled
    When an external tool appends CriticMarkup to the file:
      """
      {++externally added text++}
      """
    And I wait for external file change to propagate
    And I press Cmd+S to save
    Then the on-disk file contains "{++externally added text++}"

  Scenario: External footnoted comment is preserved after VS Code save
    Given a blank file-backed markdown document with tracking header
    And the panel shows tracking is enabled
    When an external tool writes a full change with footnote to the file:
      """
      {==review target==}{>>external review feedback<<}[^ct-1]

      [^ct-1]: @ai:claude | 2026-03-01 | comment | proposed
          External review feedback on target section
      """
    And I wait for external file change to propagate
    And I press Cmd+S to save
    Then the on-disk file contains "{>>external review feedback<<}"
    And the on-disk file contains "[^ct-1]"
    And the on-disk file contains "External review feedback on target section"

  # ===================================================================
  # PART 5: EXACT BUG REPRODUCTION — the full scenario as reported
  # ===================================================================

  Scenario: BUG REPRO — tracked file, external comment added, save loses comment
    # Exact reproduction of the 2026-03-01 bug report:
    #   1. Tracked file open in VS Code (panel shows tracking ON)
    #   2. External tool (MCP plugin) writes CriticMarkup comment to file on disk
    #   3. VS Code detects external change
    #   4. User saves the document
    #   5. EXPECTED: CriticMarkup comment preserved
    #   6. ACTUAL (BUG): comment stripped, footnotes lost
    Given a tracked file-backed document with CriticMarkup
    And the panel shows tracking is enabled
    When an external tool appends a new change before footnotes:
      """
      {==typography==}{>>The NNBSP finding connects to the weighted pass<<}[^ct-5]
      """
    And an external tool appends to the footnote section:
      """
      [^ct-5]: @ai:claude-opus-4.6 | 2026-03-01 | comment | proposed
          Typography specificity observation from variance study
      """
    And I wait for external file change to propagate
    Then the panel shows tracking is enabled
    And the live document contains "{>>The NNBSP finding connects to the weighted pass<<}"
    When I press Cmd+S to save
    Then the on-disk file contains "{>>The NNBSP finding connects to the weighted pass<<}"
    And the on-disk file contains "[^ct-5]"
    And the on-disk file contains "Typography specificity observation from variance study"
    # Pre-existing markup must also survive
    And the on-disk file contains "{++Rate limiting is enabled for all public endpoints.++}"
    And the on-disk file contains "[^ct-1]"

  Scenario: BUG REPRO — tracking ON, dirty buffer, external edit, save
    # Variant: user has typed something (buffer dirty), then external tool writes.
    Given a tracked file-backed document with CriticMarkup
    And the panel shows tracking is enabled
    When I position the cursor at line 3 column 0
    And I type " " into the editor
    And I wait 200ms
    And an external tool appends CriticMarkup to the file:
      """
      {++concurrent external edit++}
      """
    And I wait for external file change to propagate
    And I press Cmd+S to save
    # At minimum, the pre-existing CriticMarkup must survive
    Then the on-disk file contains "{++Rate limiting is enabled for all public endpoints.++}"
    And the on-disk file contains "{~~session cookies~>OAuth2 with JWT~~}"
    And the on-disk file contains "[^ct-1]"
    And the on-disk file contains "[^ct-2]"

  # ===================================================================
  # PART 6: STATE SNAPSHOT ASSERTIONS — verify intermediate states
  # ===================================================================

  Scenario: State snapshot — blank file shows correct initial panel state
    Given a blank file-backed markdown document
    Then the panel shows tracking is disabled
    And the controller state shows tracking is disabled
    And the live document does not contain "{++"
    And the live document does not contain "{--"
    And the live document does not contain "{~~"

  Scenario: State snapshot — after adding comment, tracking state unchanged
    Given a blank file-backed markdown document
    And the panel shows tracking is disabled
    When I add a comment "check this" highlighting "content" in the document
    And I wait 500ms
    Then the live document contains "{=="
    And the live document contains "check this"
    And the panel shows tracking is disabled

  Scenario: State snapshot — after toggle ON and save, both states agree
    Given a blank file-backed markdown document
    When I click the Tracking toggle
    And I wait 500ms
    Then the panel shows tracking is enabled
    And the controller state shows tracking is enabled
    When I press Cmd+S to save
    And I wait 200ms
    Then the panel shows tracking is enabled
    And the controller state shows tracking is enabled

  Scenario: State snapshot — file with tracking header shows tracking ON
    Given a blank file-backed markdown document with tracking header
    And I wait 500ms
    Then the panel shows tracking is enabled
