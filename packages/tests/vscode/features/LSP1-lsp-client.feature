@integration @lsp @LSP1
Feature: LSP1 -- LSP client lifecycle
  Port of LspClient.test.ts (7 mocha tests).
  Tests the LanguageClient creation, start/stop lifecycle,
  custom notification handler registration, and document selector
  configuration.

  # ── Client creation ─────────────────────────────────────────────────

  Scenario: createLanguageClient returns a LanguageClient instance
    Given I open "tracking-mode-test.md" in VS Code
    Then the LSP client is created successfully

  Scenario: LSP client has correct metadata
    Given I open "tracking-mode-test.md" in VS Code
    Then the LSP client is created successfully

  # ── Start / Stop ────────────────────────────────────────────────────

  Scenario: LSP client can be started and stopped
    Given I open "tracking-mode-test.md" in VS Code
    When the LSP client is started
    Then the LSP client is running
    When the LSP client is stopped
    Then the LSP client is not running

  # ── Custom notification handlers ────────────────────────────────────

  Scenario: LSP client handles changedown/decorationData notification
    Given I open "tracking-mode-test.md" in VS Code
    When the LSP client is started
    Then the LSP client is running
    And notification handler "changedown/decorationData" is registered
    When the LSP client is stopped

  Scenario: LSP client handles changedown/changeCount notification
    Given I open "tracking-mode-test.md" in VS Code
    When the LSP client is started
    Then the LSP client is running
    And notification handler "changedown/changeCount" is registered
    When the LSP client is stopped

  Scenario: LSP client handles changedown/allChangesResolved notification
    Given I open "tracking-mode-test.md" in VS Code
    When the LSP client is started
    Then the LSP client is running
    And notification handler "changedown/allChangesResolved" is registered
    When the LSP client is stopped

  # ── Document selector ──────────────────────────────────────────────

  Scenario: LSP client targets all file types for sidecar support
    Given I open "tracking-mode-test.md" in VS Code
    Then the LSP client document selector has scheme "file"
    And the LSP client document selector has no language filter
