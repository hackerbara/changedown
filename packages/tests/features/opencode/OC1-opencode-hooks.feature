@fast @OC1
Feature: OC1 - OpenCode Hooks
  The OpenCode plugin intercepts tool execution through three hook points:
  tool.execute.before blocks or warns on raw edits to tracked files,
  tool.execute.after logs edits to pending.json, and stop batch-applies
  CriticMarkup wrapping after the agent's turn ends.

  Background:
    Given a temporary OpenCode project directory

  # ── tool.execute.before: Enforcement ──

  Scenario: tool.execute.before blocks edit on tracked file when enforcement is block
    And an OpenCode config with enforcement "block"
    And a tracked file "readme.md" with content "# Hello"
    When I call OpenCode tool.execute.before with tool "edit" on file "readme.md"
    Then the OpenCode before hook throws with "blocked"

  Scenario: tool.execute.before warns on tracked file when enforcement is warn
    And an OpenCode config with enforcement "warn"
    And a tracked file "readme.md" with content "# Hello"
    When I call OpenCode tool.execute.before with tool "edit" on file "readme.md"
    Then the OpenCode before hook does not throw

  Scenario: tool.execute.before passes through non-file-modifying tools
    And an OpenCode config with enforcement "block"
    When I call OpenCode tool.execute.before with tool "read" on file "readme.md"
    Then the OpenCode before hook does not throw

  Scenario: tool.execute.before passes through out-of-scope files
    And an OpenCode config with enforcement "block"
    And a tracked file "index.js" with content "const x = 1;"
    When I call OpenCode tool.execute.before with tool "edit" on file "index.js"
    Then the OpenCode before hook does not throw

  # ── tool.execute.after: Edit Logging ──

  Scenario: tool.execute.after logs edit to pending queue for tracked file
    And an OpenCode config with enforcement "warn"
    And a tracked file "readme.md" with content "# Updated"
    When I call OpenCode tool.execute.after with tool "edit" on file "readme.md" with old "# Hello" and new "# Updated"
    Then the OpenCode pending edits contain an entry for "readme.md"

  Scenario: tool.execute.after skips non-file-modifying tools
    And an OpenCode config with enforcement "warn"
    When I call OpenCode tool.execute.after with tool "read" on file "readme.md" with old "" and new ""
    Then the OpenCode pending edits file is empty

  Scenario: tool.execute.after skips out-of-scope files
    And an OpenCode config with enforcement "warn"
    And a tracked file "index.js" with content "const x = 2;"
    When I call OpenCode tool.execute.after with tool "edit" on file "index.js" with old "const x = 1;" and new "const x = 2;"
    Then the OpenCode pending edits file is empty

  # ── stop: Batch CriticMarkup ──

  Scenario: stop hook applies pending insertion as CriticMarkup
    And an OpenCode config with enforcement "warn"
    And a file "readme.md" with content "# Hello\n\nNew paragraph here.\n"
    And an OpenCode pending insertion of "New paragraph here.\n" for file "readme.md" with context "# Hello\n\n"
    When I call OpenCode stop hook
    Then the batch file "readme.md" includes "{++"
    And the batch file "readme.md" includes "[^ct-"
    And the OpenCode pending edits file is empty

  Scenario: stop hook handles empty pending queue gracefully
    And an OpenCode config with enforcement "warn"
    When I call OpenCode stop hook
    Then the OpenCode pending edits file is empty
