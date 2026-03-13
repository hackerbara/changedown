@integration @extension @EXT1
Feature: EXT1 — Extension activation, command registration, and editor title menu

  Verifies that the ChangeTracks extension activates correctly, registers all
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
    Then the extension "hackerbara.changetracks-vscode" is present

  Scenario: Extension activates without error
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then the extension is active

  Scenario: Extension exports extendMarkdownIt function
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then the extension API has an "extendMarkdownIt" function

  Scenario: All commands are registered after activation
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then the following commands are registered:
      | command                                  |
      | changetracks.toggleTracking              |
      | changetracks.acceptChange                |
      | changetracks.rejectChange                |
      | changetracks.acceptAll                   |
      | changetracks.rejectAll                   |
      | changetracks.nextChange                  |
      | changetracks.previousChange              |
      | changetracks.addComment                  |
      | changetracks.toggleView                  |
      | changetracks.setViewMode                 |
      | changetracks.annotateFromGit             |
      | changetracks.revealPanel                 |
      | changetracks.showMenu                    |
      | changetracks.clipboardCutAction          |
      | changetracks.clipboardPasteAction        |
      | changetracks.goToLinkedChange            |
      | changetracks.revealChange                |
      | changetracks.goToPosition                |
      | changetracks.compactChange               |
      | changetracks.compactChangeFully          |
      | changetracks.showDiff                    |
      | changetracks.openDiffForResource         |
      | changetracks.acceptAllInFile             |
      | changetracks.rejectAllInFile             |
      | changetracks.showScmIndexStatus          |
      | changetracks.acceptChangeFromThread      |
      | changetracks.rejectChangeFromThread      |
      | changetracks.createComment               |
      | changetracks.replyToThread               |
      | changetracks.setupProject                |
      | changetracks.revealSettingsPanel         |
      | changetracks.openExample                 |
      | changetracks.setupAgents                 |

  Scenario: changetracks.* command count matches expected total
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then exactly 37 commands in the "changetracks." namespace are registered

  Scenario: Activation on a markdown file works
    Given VS Code is launched with a markdown fixture
    When a markdown document with content "# Hello\n\nSome {++tracked++} content." is opened
    Then the extension "hackerbara.changetracks-vscode" is active

  Scenario: Context keys are set after activation
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then executing "changetracks.toggleTracking" does not throw
    And executing "changetracks.toggleTracking" does not throw

  Scenario: Deactivate export exists
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then the extension module exports a "deactivate" function

  Scenario: OutputChannel is exported after activation
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then the extension module exports "outputChannel"

  # ── Command registration (9 core declared commands) ─────────────────

  Scenario: All 9 declared commands are registered
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then the following commands are registered:
      | command                          |
      | changetracks.toggleTracking      |
      | changetracks.acceptChange        |
      | changetracks.rejectChange        |
      | changetracks.acceptAll           |
      | changetracks.rejectAll           |
      | changetracks.nextChange          |
      | changetracks.previousChange      |
      | changetracks.addComment          |
      | changetracks.toggleView          |

  Scenario: Each declared command found in changetracks.* namespace
    Given VS Code is launched with a markdown fixture
    When the extension "hackerbara.changetracks-vscode" is activated
    Then all 9 declared commands exist in the "changetracks." namespace

  Scenario: Commands on non-markdown file do not throw
    Given VS Code is launched with a markdown fixture
    When a plaintext document with content "Just plain text, not markdown." is opened
    Then executing each of the 9 declared commands does not throw

  # ── Editor title menu ───────────────────────────────────────────────

  Scenario: toggleView can be called without error
    Given VS Code is launched with a markdown fixture
    When a markdown document with content "Test content" is opened
    Then executing "changetracks.toggleView" does not throw
    And executing "changetracks.toggleView" does not throw

  Scenario: toggleTracking can be called without error
    Given VS Code is launched with a markdown fixture
    When a markdown document with content "Test content" is opened
    Then executing "changetracks.toggleTracking" does not throw
    And executing "changetracks.toggleTracking" does not throw

  # ── Package.json contribution point checks (@fast tier) ─────────────

  @fast @EXT1-pkg
  Scenario: Package.json declares editor/title menu items for markdown
    Given the extension package.json
    Then the editor/title menu has an entry for "changetracks.toggleTracking"
    And the editor/title menu has an entry for "changetracks.toggleView"
    And the editor/title menu has an entry for "changetracks.addComment"
    And all editor/title menu entries have "when" conditions containing "resourceLangId == markdown"

  @fast @EXT1-pkg
  Scenario: Package.json declares all 9 core commands
    Given the extension package.json
    Then the package.json commands section includes:
      | command                          |
      | changetracks.toggleTracking      |
      | changetracks.acceptChange        |
      | changetracks.rejectChange        |
      | changetracks.acceptAll           |
      | changetracks.rejectAll           |
      | changetracks.nextChange          |
      | changetracks.previousChange      |
      | changetracks.addComment          |
      | changetracks.toggleView          |
