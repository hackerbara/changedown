@fast @H6
Feature: H6 - Claude Code Adapter
  The Claude Code hook adapter translates Claude Code's PreToolUse, PostToolUse,
  and Stop hook events into ChangeDown policy evaluation and edit tracking.
  PreToolUse intercepts Edit/Write/Read tool calls; PostToolUse logs edits to
  pending.json; Stop applies batch CriticMarkup wrapping.

  Background:
    Given a temporary project directory

  # ── PreToolUse: Policy Enforcement ──

  Scenario: PreToolUse allows non-edit tools through without interference
    And a safety-net mode config
    When I call Claude Code PreToolUse with tool "Bash" on file ""
    Then the Claude Code hook returns empty

  Scenario: PreToolUse returns allow with advisory in safety-net mode for tracked file
    And a safety-net mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Claude Code PreToolUse with tool "Edit" on file "readme.md"
    Then the Claude Code hook decision is "allow"
    And the Claude Code hook has additional context

  Scenario: PreToolUse denies Edit on tracked file in strict mode with warm redirect
    And a strict mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Claude Code PreToolUse with tool "Edit" on file "readme.md"
    Then the Claude Code hook decision is "deny"
    And the Claude Code hook reason contains "propose_change"

  Scenario: PreToolUse returns empty for out-of-scope file regardless of mode
    And a strict mode config
    And a tracked file "index.js" with content "const x = 1;"
    When I call Claude Code PreToolUse with tool "Edit" on file "index.js"
    Then the Claude Code hook returns empty

  Scenario: PreToolUse passes read_tracked_file through unconditionally
    And a strict mode config
    When I call Claude Code PreToolUse with tool "read_tracked_file" on file "readme.md"
    Then the Claude Code hook returns empty

  # ── PreToolUse: Read Interception ──

  Scenario: PreToolUse denies Read on tracked file in strict mode
    And a strict mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Claude Code PreToolUse with tool "Read" on file "readme.md"
    Then the Claude Code hook decision is "deny"
    And the Claude Code hook reason contains "read_tracked_file"

  Scenario: PreToolUse allows Read on tracked file in safety-net mode
    And a safety-net mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call Claude Code PreToolUse with tool "Read" on file "readme.md"
    Then the Claude Code hook returns empty

  # ── PostToolUse: Edit Logging ──

  Scenario: PostToolUse logs Edit on in-scope file in safety-net mode
    And a safety-net mode config
    And a tracked file "readme.md" with content "Updated content"
    When I call Claude Code PostToolUse with tool "Edit" on file "readme.md" with old "Original" and new "Updated content"
    Then the Claude Code post hook logged is true
    And the pending edits contain an entry for "readme.md"

  Scenario: PostToolUse does not log non-edit tools
    And a safety-net mode config
    When I call Claude Code PostToolUse with tool "Bash" on file "" with old "" and new ""
    Then the Claude Code post hook logged is false

  Scenario: PostToolUse does not log out-of-scope files
    And a safety-net mode config
    And a tracked file "index.js" with content "const x = 2;"
    When I call Claude Code PostToolUse with tool "Edit" on file "index.js" with old "const x = 1;" and new "const x = 2;"
    Then the Claude Code post hook logged is false

  Scenario: PostToolUse does not log edits in strict mode
    And a strict mode config
    And a tracked file "readme.md" with content "Updated"
    When I call Claude Code PostToolUse with tool "Edit" on file "readme.md" with old "Original" and new "Updated"
    Then the Claude Code post hook logged is false

  # ── Stop: Batch Wrapping ──

  Scenario: Stop applies pending edits as CriticMarkup in safety-net mode
    And a safety-net mode config
    And a file "readme.md" with content "# Updated heading\n"
    And a Claude Code pending substitution from "# Original heading" to "# Updated heading" in session "ses_cc"
    When I call Claude Code Stop for session "ses_cc"
    Then the batch file "readme.md" includes "{~~# Original heading~># Updated heading~~}"
    And the batch file "readme.md" includes "[^cn-"

  Scenario: Stop returns empty and clears edits in strict mode
    And a strict mode config
    And a file "readme.md" with content "Updated"
    And a Claude Code pending substitution from "Original" to "Updated" in session "ses_strict"
    When I call Claude Code Stop for session "ses_strict"
    Then the pending edits file is empty
