Feature: H1 - Policy Engine
  The policy engine evaluates raw edits and MCP calls against the project's
  tracking configuration. It enforces three modes: strict (deny raw edits to
  tracked files), safety-net (warn but allow), and permissive (allow everything).

  Background:
    Given a project directory

  # ── Raw Edit Evaluation ──

  Scenario: Strict mode denies raw edits to tracked markdown files
    Given the policy mode is "strict"
    When I evaluate a raw edit to a tracked file "docs/readme.md"
    Then the policy action is "deny"
    And the policy hint contains "propose_change"

  Scenario: Safety-net mode warns on raw edits to tracked files
    Given the policy mode is "safety-net"
    When I evaluate a raw edit to a tracked file "docs/readme.md"
    Then the policy action is "warn"

  Scenario: Permissive mode allows raw edits to tracked files
    Given the policy mode is "permissive"
    When I evaluate a raw edit to a tracked file "docs/readme.md"
    Then the policy action is "allow"

  Scenario: Untracked files always pass through regardless of policy mode
    Given the policy mode is "strict"
    When I evaluate a raw edit to an untracked file "src/app.ts"
    Then the policy action is "allow"

  Scenario: Hook-excluded files are allowed even in safety-net mode
    Given the policy mode is "safety-net"
    And the hooks exclude pattern is "docs/readme.md"
    When I evaluate a raw edit to a tracked file "docs/readme.md"
    Then the policy action is "allow"

  # ── Raw Read Evaluation ──

  Scenario: Strict mode denies raw reads on tracked files
    Given the policy mode is "strict"
    When I evaluate a raw read to a tracked file "docs/readme.md"
    Then the policy action is "deny"
    And the policy hint contains "read_tracked_file"

  Scenario: Safety-net mode allows raw reads (only edits are guarded)
    Given the policy mode is "safety-net"
    When I evaluate a raw read to a tracked file "docs/readme.md"
    Then the policy action is "allow"

  # ── MCP Call Evaluation ──

  Scenario: ChangeDown MCP read tools always pass through
    When I evaluate an MCP call "read_tracked_file" with no author
    Then the policy action is "allow"

  Scenario: MCP write tools require author when enforcement is required
    Given the author enforcement is "required"
    When I evaluate an MCP call "propose_change" with no author
    Then the policy action is "deny"
    And the policy reason contains "author"

  Scenario: MCP write tools pass with author when enforcement is required
    Given the author enforcement is "required"
    When I evaluate an MCP call "propose_change" with author "ai:claude"
    Then the policy action is "allow"

  # ── Hashline Tip ──

  Scenario: Hashline tip included in agent hint when hashline.enabled is true
    Given the policy mode is "safety-net"
    And hashline is enabled
    When I evaluate a raw edit to a tracked file "docs/readme.md"
    Then the policy action is "warn"
    And the policy hint contains "read_tracked_file"

  # ── Raw Read Edge Cases ──

  Scenario: Raw read on non-tracked file is allowed regardless of policy mode
    Given the policy mode is "strict"
    When I evaluate a raw read to an untracked file "src/app.ts"
    Then the policy action is "allow"

  Scenario: Permissive mode allows raw reads on tracked files
    Given the policy mode is "permissive"
    When I evaluate a raw read to a tracked file "docs/readme.md"
    Then the policy action is "allow"

  # ── MCP Call Edge Cases ──

  Scenario: get_change tool always allowed without author
    When I evaluate an MCP call "get_change" with no author
    Then the policy action is "allow"

  Scenario: review_changes denied without author when enforcement is required
    Given the author enforcement is "required"
    When I evaluate an MCP call "review_changes" with no author
    Then the policy action is "deny"
    And the policy reason contains "author"

  Scenario: amend_change denied without author when enforcement is required
    Given the author enforcement is "required"
    When I evaluate an MCP call "amend_change" with no author
    Then the policy action is "deny"
    And the policy reason contains "author"

  Scenario: Optional enforcement allows propose_change without author
    Given the author enforcement is "optional"
    When I evaluate an MCP call "propose_change" with no author
    Then the policy action is "allow"
