@wip @coverage-gap @red
Feature: CFG2 — Configuration Setting Coverage Gaps

  These scenarios document settings with ZERO test coverage.
  Each targets a declared changetracks.* setting from package.json
  that has no existing test verifying its behavior.

  @fast
  Scenario: CFG2-01 editBoundary.pauseThresholdMs is read directly from config
    Given the setting "changetracks.editBoundary.pauseThresholdMs" is 5000
    When I create a PendingEditManager
    Then the effective pause threshold is 5000

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-02 defaultViewMode sets initial view on file open
    Given the setting "changetracks.defaultViewMode" is "simple"
    When I open a markdown file with CriticMarkup
    Then the active view mode is "simple"

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-03 author setting appears in tracked changes
    Given the setting "changetracks.author" is "alice"
    And a tracking-mode editor with content "Hello world"
    When I type " test"
    And I wait for edit boundary detection
    Then the document contains "@alice"

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-04 confirmBulkThreshold triggers confirmation dialog
    Given the setting "changetracks.confirmBulkThreshold" is 2
    And a document with 3 tracked changes
    When I execute "ChangeTracks: Accept All Changes"
    Then a confirmation dialog appears

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-05 trackingMode persists across window reload
    Given tracking mode is enabled
    When I reload the window
    Then tracking mode is still enabled

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-06 decorationStyle "background" uses background tinting
    Given the setting "changetracks.decorationStyle" is "background"
    And a document with a deletion "{--removed--}"
    Then deletions are rendered with background tinting

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-07 commentsExpandedByDefault true expands comments on open
    Given the setting "changetracks.commentsExpandedByDefault" is true
    When I open a markdown file with comments
    Then comment threads are expanded by default

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-08 preferGutter prompts to disable Git SCM
    Given the setting "changetracks.preferGutter" is true
    And a document with tracked changes
    Then a prompt to disable Git SCM gutter is shown

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-09 commentInsertAuthor false omits author from comments
    Given the setting "changetracks.commentInsertAuthor" is false
    And the setting "changetracks.author" is "alice"
    When I add a comment to a tracked change
    Then the comment does not include "@alice"

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-10 preview.showFootnotes false hides footnote panel
    Given the setting "changetracks.preview.showFootnotes" is false
    And a document with footnote definitions
    When I open the markdown preview
    Then the footnote panel is not visible in the preview

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-11 preview.metadataDetail "projected" shows all metadata inline
    Given the setting "changetracks.preview.metadataDetail" is "projected"
    And a document with tracked changes and footnotes
    When I open the markdown preview
    Then all metadata is displayed inline at each change anchor

  @slow @fixture(tracking-mode-test)
  Scenario: CFG2-12 showWalkthroughOnStartup "never" suppresses walkthrough
    Given the setting "changetracks.showWalkthroughOnStartup" is "never"
    When I open a new workspace
    Then no walkthrough is displayed
