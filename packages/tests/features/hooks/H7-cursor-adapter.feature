@fast @H7
Feature: H7 - Cursor Adapter
  The Cursor hook adapter translates Cursor's hook events into ChangeDown
  policy evaluation and edit tracking. Cursor uses different event names and
  field mappings (workspace_roots instead of cwd, conversation_id instead of
  session_id, file_path/edits instead of tool_input).

  Background:
    Given a temporary project directory

  # ── preToolUse: Raw Edit Policy ──

  Scenario: Cursor preToolUse allows non-write tools
    And a strict mode config
    When I call Cursor preToolUse with tool "Read" on file "readme.md"
    Then the Cursor decision is "allow"

  Scenario: Cursor preToolUse denies Edit on tracked file in strict mode
    And a strict mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Cursor preToolUse with tool "Edit" on file "readme.md"
    Then the Cursor decision is "deny"
    And the Cursor reason contains "tracked by ChangeDown"

  Scenario: Cursor preToolUse allows Edit on non-tracked file type
    And a strict mode config
    And a tracked file "index.js" with content "const x = 1;"
    When I call Cursor preToolUse with tool "Edit" on file "index.js"
    Then the Cursor decision is "allow"

  # ── afterFileEdit: Edit Logging ──

  Scenario: Cursor afterFileEdit logs edit for in-scope file in safety-net mode
    And a safety-net mode config
    And a tracked file "readme.md" with content "# Updated"
    When I call Cursor afterFileEdit on "readme.md" with old "# Hello" and new "# Updated" in conversation "cur-conv-1"
    Then the pending edits contain an entry for "readme.md" with session "cur-conv-1"

  Scenario: Cursor afterFileEdit skips logging in strict mode
    And a strict mode config
    And a tracked file "readme.md" with content "# Updated"
    When I call Cursor afterFileEdit on "readme.md" with old "# Hello" and new "# Updated" in conversation "cur-conv-1"
    Then the pending edits file is empty

  Scenario: Cursor afterFileEdit skips out-of-scope files
    And a safety-net mode config
    And a tracked file "index.js" with content "const x = 2;"
    When I call Cursor afterFileEdit on "index.js" with old "const x = 1;" and new "const x = 2;" in conversation "cur-conv-1"
    Then the pending edits file is empty

  # ── beforeMCPExecution: MCP Tool Validation ──

  Scenario: Cursor beforeMCPExecution passes through non-ChangeDown tools
    When I call Cursor beforeMCPExecution with tool "some_other_tool"
    Then the Cursor MCP response continues

  Scenario: Cursor beforeMCPExecution allows read_tracked_file
    When I call Cursor beforeMCPExecution with tool "read_tracked_file"
    Then the Cursor MCP response continues
    And the Cursor MCP permission is "allow"

  Scenario: Cursor beforeMCPExecution blocks propose_change without author when required
    And a Cursor config with author enforcement "required"
    When I call Cursor beforeMCPExecution with tool "propose_change" without author
    Then the Cursor MCP response blocks
    And the Cursor MCP message contains "author"

  # ── beforeReadFile: Read Interception ──

  Scenario: Cursor beforeReadFile allows .cursor/ internal files unconditionally
    And a strict mode config
    When I call Cursor beforeReadFile on ".cursor/settings.json"
    Then the Cursor read response continues

  Scenario: Cursor beforeReadFile blocks tracked file in strict mode
    And a strict mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Cursor beforeReadFile on "readme.md"
    Then the Cursor read response blocks

  Scenario: Cursor beforeReadFile allows tracked file in safety-net mode
    And a safety-net mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Cursor beforeReadFile on "readme.md"
    Then the Cursor read response continues
    And the Cursor read permission is "allow"

  # ── stop: Batch Wrapping ──

  Scenario: Cursor stop applies CriticMarkup in safety-net mode
    And a safety-net mode config
    And a file "readme.md" with content "# Updated"
    And a Cursor pending substitution from "# Hello" to "# Updated" in conversation "cur-conv-1"
    When I call Cursor stop for conversation "cur-conv-1"
    Then the batch file "readme.md" includes "{~~"
    And the batch file "readme.md" includes "[^cn-"

  Scenario: Cursor stop clears edits without wrapping in strict mode
    And a strict mode config
    And a file "readme.md" with content "# Updated"
    And a Cursor pending substitution from "# Hello" to "# Updated" in conversation "cur-conv-1"
    When I call Cursor stop for conversation "cur-conv-1"
    Then the pending edits file is empty
