@slow @PB25 @fixture(tracking-mode-test) @destructive
Feature: PB-25 — Comment insertion with tracking mode ON creates spurious insertion
  Production bug: When tracking mode is enabled and the user highlights text
  and adds a comment, the addComment() method creates a WorkspaceEdit with
  both inline markup ({==text==}{>>comment<<}) and a footnote. But because
  addComment() did NOT set isApplyingTrackedEdit=true before calling
  vscode.workspace.applyEdit(), the onDidChangeTextDocument handler sees the
  footnote insertion as new user content and wraps it in {++...++}, corrupting
  the document.

  Root cause: addComment() did not set isApplyingTrackedEdit=true
  before calling vscode.workspace.applyEdit(). The footnote text does
  not contain CriticMarkup delimiters, so isCriticMarkupSyntax() does
  not catch it.

  Fix: isApplyingTrackedEdit guard was added around both addComment code
  paths (footnote and inline) in controller.ts.

  These scenarios invoke the REAL addComment() command via the command
  palette and Quick Input, not via editor.executeEdits() which bypasses
  the controller entirely. Each scenario resets the editor content and
  verifies tracking is ON, avoiding state leakage from prior scenarios.

  Scenario: Footnoted comment with tracking ON does not create spurious {++} insertion
    Given a fresh tracking-mode editor with the fixture content
    When I invoke Add Comment on selection "clean" with text "review note"
    And I wait for edit boundary detection
    Then the document contains "{=="
    And the document contains "{>>"
    And the document contains "review note"
    And the document does not contain "{++"

  Scenario: Highlight comment with tracking ON is not double-wrapped
    Given a fresh tracking-mode editor with the fixture content
    When I invoke Add Comment on selection "testing" with text "inline note"
    And I wait for edit boundary detection
    Then the document contains "{=="
    And the document contains "{>>"
    And the document contains "inline note"
    And the document does not contain "{++"

  Scenario: Comment at cursor with tracking ON does not produce spurious insertion
    Given a fresh tracking-mode editor with the fixture content
    When I position the cursor at line 4 column 10
    And I invoke Add Comment at cursor with text "cursor comment"
    And I wait for edit boundary detection
    Then the document contains "{>>"
    And the document contains "cursor comment"
    And the document does not contain "{++"
