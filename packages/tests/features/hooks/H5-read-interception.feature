Feature: H5 - Read Interception
  When policy mode is strict, raw Read tool calls on tracked files are denied
  with a warm redirect to read_tracked_file. Safety-net and permissive modes
  allow reads through. The redirect message includes a pre-formatted
  read_tracked_file call with the project's default view.

  Background:
    Given a project directory

  # ── Redirect Formatter ──

  Scenario: Read redirect includes read_tracked_file call with default view
    When I format a read redirect for "docs/readme.md"
    Then the redirect contains "read_tracked_file"
    And the redirect contains 'file="docs/readme.md"'
    And the redirect contains 'view="review"'

  Scenario: Read redirect uses configured default_view
    Given the default view is "changes"
    When I format a read redirect for "docs/readme.md"
    Then the redirect contains 'view="changes"'

  Scenario: Read redirect mentions strict mode
    When I format a read redirect for "docs/readme.md"
    Then the redirect contains "strict mode"

  # ── PreToolUse Adapter (Claude Code) ──

  Scenario: Strict mode denies Read on tracked file via PreToolUse
    Given a temporary project directory
    And a strict mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call PreToolUse with Read on "readme.md"
    Then the hook decision is "deny"
    And the hook reason contains "read_tracked_file"

  Scenario: Safety-net mode allows Read on tracked file via PreToolUse
    Given a temporary project directory
    And a safety-net mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call PreToolUse with Read on "readme.md"
    Then the hook returns empty

  Scenario: Read on non-tracked file passes through regardless of mode
    Given a temporary project directory
    And a strict mode config
    When I call PreToolUse with Read on "src/app.ts"
    Then the hook returns empty

  # ── PostToolUse Audit Logging ──

  Scenario: Raw Read on tracked file is audit-logged in PostToolUse
    Given a temporary project directory
    And a safety-net mode config
    And a tracked file "readme.md" with content "# Hello"
    When I call PostToolUse with Read on "readme.md"
    Then the audit log contains a read entry for "readme.md"

  Scenario: Raw Read on non-tracked file is not logged
    Given a temporary project directory
    And a safety-net mode config
    When I call PostToolUse with Read on "app.ts"
    Then no audit entry is logged
