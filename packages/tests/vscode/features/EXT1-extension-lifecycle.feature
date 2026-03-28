@integration @extension @EXT1
Feature: EXT1 — Extension activation, command registration, and editor title menu

  Verifies that the ChangeDown extension activates correctly, registers all
  expected commands, exports the expected API surface, and configures editor
  title menu items properly.

  # -----------------------------------------------------------------------
  # TIER DECISION: @integration (NOT @fast)
  #
  # These tests require VS Code Extension Host APIs:
  #   1. vscode.extensions.getExtension() for activation checks
  #   2. vscode.commands.getCommands() for command registration checks
  #   3. vscode.commands.executeCommand() for command execution checks
  #   4. vscode.workspace.openTextDocument() for document creation
  #   5. ExtensionController constructor requires vscode.ExtensionContext
  #
  # The mocha originals run inside the VS Code Extension Host process.
  # These Gherkin scenarios use Playwright to drive VS Code Electron,
  # matching the @slow/@integration tier infrastructure.
  #
  # EXCEPTION: Package.json contribution point checks (Scenarios tagged
  # @fast @EXT1-pkg) are pure JSON assertions and run without VS Code.
  # -----------------------------------------------------------------------

  # ── Extension activation ────────────────────────────────────────────

  Scenario: Extension is present in the extensions list
    Given VS Code is launched with a markdown fixture
    Then the extension "hackerbara.changedown-vscode" is present

  Scenario: Extension activates without error
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then the extension is active

  Scenario: Extension exports extendMarkdownIt function
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then the extension API has an "extendMarkdownIt" function

  Scenario: All commands are registered after activation
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then the following commands are registered:
      | command                                  |
      | changedown.toggleTracking              |
      | changedown.acceptChange                |
      | changedown.rejectChange                |
      | changedown.acceptAll                   |
      | changedown.rejectAll                   |
      | changedown.nextChange                  |
      | changedown.previousChange              |
      | changedown.addComment                  |
      | changedown.toggleView                  |
      | changedown.setViewMode                 |
      | changedown.annotateFromGit             |
      | changedown.revealPanel                 |
      | changedown.showMenu                    |
      | changedown.clipboardCutAction          |
      | changedown.clipboardPasteAction        |
      | changedown.goToLinkedChange            |
      | changedown.revealChange                |
      | changedown.goToPosition                |
      | changedown.compactChange               |
      | changedown.compactChangeFully          |
      | changedown.showDiff                    |
      | changedown.openDiffForResource         |
      | changedown.acceptAllInFile             |
      | changedown.rejectAllInFile             |
      | changedown.showScmIndexStatus          |
      | changedown.acceptChangeFromThread      |
      | changedown.rejectChangeFromThread      |
      | changedown.createComment               |
      | changedown.replyToThread               |
      | changedown.setupProject                |
      | changedown.revealSettingsPanel         |
      | changedown.openExample                 |
      | changedown.setupAgents                 |

  Scenario: changedown.* command count matches expected total
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then exactly 37 commands in the "changedown." namespace are registered

  Scenario: Activation on a markdown file works
    Given VS Code is launched with a markdown fixture
    When a markdown document with content "# Hello\n\nSome {++tracked++} content." is opened
    Then the extension "hackerbara.changedown-vscode" is active

  Scenario: Context keys are set after activation
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then executing "changedown.toggleTracking" does not throw
    And executing "changedown.toggleTracking" does not throw

  Scenario: Deactivate export exists
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then the extension module exports a "deactivate" function

  Scenario: OutputChannel is exported after activation
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then the extension module exports "outputChannel"

  # ── Command registration (9 core declared commands) ─────────────────

  Scenario: All 9 declared commands are registered
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then the following commands are registered:
      | command                          |
      | changedown.toggleTracking      |
      | changedown.acceptChange        |
      | changedown.rejectChange        |
      | changedown.acceptAll           |
      | changedown.rejectAll           |
      | changedown.nextChange          |
      | changedown.previousChange      |
      | changedown.addComment          |
      | changedown.toggleView          |

  Scenario: Each declared command found in changedown.* namespace
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changedown-vscode" is activated
    Then all 9 declared commands exist in the "changedown." namespace

  Scenario: Commands on non-markdown file do not throw
    Given VS Code is launched with a markdown fixture
    When a plaintext document with content "Just plain text, not markdown." is opened
    Then executing each of the 9 declared commands does not throw

  # ── Editor title menu ───────────────────────────────────────────────

  Scenario: toggleView can be called without error
    Given VS Code is launched with a markdown fixture
    When a markdown document with content "Test content" is opened
    Then executing "changedown.toggleView" does not throw
    And executing "changedown.toggleView" does not throw

  Scenario: toggleTracking can be called without error
    Given VS Code is launched with a markdown fixture
    When a markdown document with content "Test content" is opened
    Then executing "changedown.toggleTracking" does not throw
    And executing "changedown.toggleTracking" does not throw

  # ── Package.json contribution point checks (@fast tier) ─────────────

  @fast @EXT1-pkg
  Scenario: Package.json declares editor/title menu items for markdown
    Given the extension package.json
    Then the editor/title menu has an entry for "changedown.toggleTracking"
    And the editor/title menu has an entry for "changedown.toggleView"
    And the editor/title menu has an entry for "changedown.addComment"
    And all editor/title menu entries have "when" conditions containing "resourceLangId == markdown"

  @fast @EXT1-pkg
  Scenario: Package.json declares all 9 core commands
    Given the extension package.json
    Then the package.json commands section includes:
      | command                          |
      | changedown.toggleTracking      |
      | changedown.acceptChange        |
      | changedown.rejectChange        |
      | changedown.acceptAll           |
      | changedown.rejectAll           |
      | changedown.nextChange          |
      | changedown.previousChange      |
      | changedown.addComment          |
      | changedown.toggleView          |
