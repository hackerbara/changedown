@wip @coverage-gap @red @slow @DOCX1
Feature: DOCX1 — DOCX custom editor
  As a document author
  I want to open DOCX files with tracked changes in VS Code
  So I can convert them to CriticMarkup markdown for review

  # ── Custom editor opens ──────────────────────────────────────

  Scenario: DOCX1-01 Opening .docx shows custom editor panel
    Given I open "stress-test-via-changetracks-output.docx" in VS Code
    And I wait 2000 milliseconds
    Then the status bar shows "docx"
    # Custom editor should display import prompt

  # ── Import creates markdown ──────────────────────────────────

  Scenario: DOCX1-02 Import button creates -changetracks.md file
    Given I open "stress-test-via-changetracks-output.docx" in VS Code
    And I wait 2000 milliseconds
    # Import button click would create stress-test-via-changetracks-output-changetracks.md
    Then the status bar shows "docx"

  # ── Filename convention ──────────────────────────────────────

  Scenario: DOCX1-03 Generated filename follows -changetracks.md convention
    Given I open "stress-test-via-changetracks-output.docx" in VS Code
    And I wait 2000 milliseconds
    Then the status bar shows "docx"
    # Expected output: stress-test-via-changetracks-output-changetracks.md

  # ── Export command ───────────────────────────────────────────

  @fixture(journey-review-target)
  Scenario: DOCX1-04 Export to DOCX command available on markdown
    Given I open "journey-review-target.md" in VS Code
    And the ChangeTracks extension is active
    And I wait for changes to load
    When I execute "ChangeTracks: Export to DOCX"
    And I wait 1000 milliseconds
    Then the status bar shows "changes"
    # Export dialog should appear (cancel to avoid file creation)

  # ── Export on non-markdown ───────────────────────────────────

  Scenario: DOCX1-05 Export command on non-markdown shows warning
    When I execute "workbench.action.files.newUntitledFile"
    And I wait 500 milliseconds
    And I execute "ChangeTracks: Export to DOCX"
    And I wait 1000 milliseconds
    Then the status bar shows "Untitled"
    # Should show "Open a markdown file to export to DOCX" warning

  # ── Open existing ────────────────────────────────────────────

  Scenario: DOCX1-06 Open existing button appears when -changetracks.md exists
    Given I open "stress-test-via-changetracks-output.docx" in VS Code
    And I wait 2000 milliseconds
    Then the status bar shows "docx"
    # If stress-test-via-changetracks-output-changetracks.md exists, "Open existing" shown

  # ── Error handling ───────────────────────────────────────────

  Scenario: DOCX1-07 Import error shows error message
    Given I open "stress-test-via-changetracks-output.docx" in VS Code
    And I wait 2000 milliseconds
    Then the status bar shows "docx"
    # On import failure, error message displayed, panel stays open
