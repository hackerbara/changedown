@fast @E7
Feature: E7 - CLI Settle
  `sc settle` compacts accepted and rejected changes by removing their inline
  CriticMarkup, leaving proposed changes untouched. Supports dry-run mode and
  is idempotent.

  # ── Accepted insertion settlement ───────────────────────────────────────────

  Scenario: Settles an accepted insertion — removes markup, keeps text
    Given content for settlement:
      """
      Hello {++world++}[^ct-1].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: added greeting
      """
    When I compute settlement
    Then the settled count is 1
    And the settled content contains "world"
    And the settled content does not contain "{++"
    And the settled content does not contain "++}"

  # ── Accepted deletion settlement ────────────────────────────────────────────

  Scenario: Settles an accepted deletion — removes markup and deleted text
    Given content for settlement:
      """
      Hello {--world--}[^ct-1] there.

      [^ct-1]: @alice | 2026-02-01 | del | accepted
          reason: removed word
      """
    When I compute settlement
    Then the settled count is 1
    And the settled content does not contain "{--"
    And the settled content does not contain "--}"
    And the settled content contains "Hello"
    And the settled content contains "there"

  # ── Rejected change settlement ──────────────────────────────────────────────

  Scenario: Settles a rejected insertion — removes markup and inserted text
    Given content for settlement:
      """
      Hello {++world++}[^ct-1] there.

      [^ct-1]: @alice | 2026-02-01 | ins | rejected
          reason: not needed
      """
    When I compute settlement
    Then the settled count is 1
    And the settled content does not contain "{++"
    And the settled content contains "Hello"
    And the settled content contains "there"

  Scenario: Settles a rejected deletion — removes markup, restores deleted text
    Given content for settlement:
      """
      Hello {--world--}[^ct-1] there.

      [^ct-1]: @alice | 2026-02-01 | del | rejected
          reason: keep it
      """
    When I compute settlement
    Then the settled count is 1
    And the settled content contains "world"
    And the settled content does not contain "{--"

  # ── Proposed changes left untouched ─────────────────────────────────────────

  Scenario: Proposed changes are not settled
    Given content for settlement:
      """
      Hello {++world++} there.
      """
    When I compute settlement
    Then the settled count is 0
    And the settled content is unchanged

  # ── No changes ──────────────────────────────────────────────────────────────

  Scenario: Plain text with no changes returns zero settled count
    Given content for settlement:
      """
      Just plain text.
      """
    When I compute settlement
    Then the settled count is 0
    And the settled content is unchanged

  # ── Mixed statuses ──────────────────────────────────────────────────────────

  Scenario: Settles only accepted and rejected, leaves proposed
    Given content for settlement:
      """
      {++added++}[^ct-1] and {--removed--}[^ct-2] and {++pending++}.

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: keep
      [^ct-2]: @bob | 2026-02-01 | del | rejected
          reason: restore
      """
    When I compute settlement
    Then the settled count is 2
    And the settled content contains "added"
    And the settled content contains "removed"
    And the settled content contains "{++pending++}"

  # ── Idempotent settlement ───────────────────────────────────────────────────

  Scenario: Running settlement twice produces the same content
    Given content for settlement:
      """
      Hello {++world++}[^ct-1].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: added greeting
      """
    When I compute settlement
    And I compute settlement again on the settled content
    Then the first and second settled contents are identical

  # ── Dry-run mode ────────────────────────────────────────────────────────────

  Scenario: Dry-run reports count without modifying content
    Given content for settlement:
      """
      Hello {++world++}[^ct-1].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: added greeting
      """
    When I compute settlement as dry-run
    Then the settled count is 1
    And the original content is preserved
