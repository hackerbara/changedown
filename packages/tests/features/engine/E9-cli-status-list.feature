@fast @E9
Feature: E9 - CLI Status & List
  `sc status` shows change count summaries by type and status.
  `sc list` shows individual changes with metadata and supports status filtering.

  # ── sc status ───────────────────────────────────────────────────────────────

  Scenario: Status of clean text returns all zeros
    Given content for status:
      """
      Hello world.
      """
    When I compute status
    Then the status proposed count is 0
    And the status accepted count is 0
    And the status rejected count is 0
    And the status total count is 0

  Scenario: Status counts proposed changes (no footnotes)
    Given content for status:
      """
      Hello {++world++} and {--goodbye--}.
      """
    When I compute status
    Then the status proposed count is 2
    And the status accepted count is 0
    And the status rejected count is 0
    And the status total count is 2

  Scenario: Status counts mixed accepted and rejected via footnotes
    Given content for status:
      """
      Hello {++world++}[^ct-1] and {--goodbye--}[^ct-2].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: added greeting
      [^ct-2]: @bob | 2026-02-02 | del | rejected
          reason: keep farewell
      """
    When I compute status
    Then the status proposed count is 0
    And the status accepted count is 1
    And the status rejected count is 1
    And the status total count is 2

  Scenario: Changes without footnote definitions default to proposed
    Given content for status:
      """
      Some {~~old~>new~~} text with {++added++}.
      """
    When I compute status
    Then the status proposed count is 2
    And the status total count is 2

  # ── sc list ─────────────────────────────────────────────────────────────────

  Scenario: List returns empty array for clean text
    Given content for list:
      """
      Hello world.
      """
    When I compute change list
    Then the change list is empty

  Scenario: List shows insertion with metadata from footnote
    Given content for list:
      """
      Hello {++world++}[^ct-1].

      [^ct-1]: @alice | 2026-02-01 | ins | proposed
          reason: added greeting
      """
    When I compute change list
    Then the change list has 1 entry
    And change list entry 1 has change_id "ct-1"
    And change list entry 1 has type "ins"
    And change list entry 1 has status "proposed"
    And change list entry 1 has author "@alice"
    And change list entry 1 has line 1
    And change list entry 1 has preview "world"

  Scenario: List shows substitution preview with arrow separator
    Given content for list:
      """
      Some {~~old text~>new text~~} here.
      """
    When I compute change list
    Then the change list has 1 entry
    And change list entry 1 has type "sub"
    And change list entry 1 has preview "old text~>new text"

  # ── sc list --status filtering ──────────────────────────────────────────────

  Scenario: List filters by accepted status
    Given content for list:
      """
      {++added++}[^ct-1] and {--removed--}[^ct-2].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: good addition
      [^ct-2]: @bob | 2026-02-02 | del | proposed
          reason: remove this
      """
    When I compute change list filtered by status "accepted"
    Then the change list has 1 entry
    And change list entry 1 has change_id "ct-1"

  Scenario: List filters by proposed status
    Given content for list:
      """
      {++added++}[^ct-1] and {--removed--}[^ct-2].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: good addition
      [^ct-2]: @bob | 2026-02-02 | del | proposed
          reason: remove this
      """
    When I compute change list filtered by status "proposed"
    Then the change list has 1 entry
    And change list entry 1 has change_id "ct-2"

  Scenario: List filters by rejected status returns empty when none match
    Given content for list:
      """
      {++added++}[^ct-1] and {--removed--}[^ct-2].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: good addition
      [^ct-2]: @bob | 2026-02-02 | del | proposed
          reason: remove this
      """
    When I compute change list filtered by status "rejected"
    Then the change list is empty

  Scenario: List without filter returns all changes
    Given content for list:
      """
      {++added++}[^ct-1] and {--removed--}[^ct-2].

      [^ct-1]: @alice | 2026-02-01 | ins | accepted
          reason: good addition
      [^ct-2]: @bob | 2026-02-02 | del | proposed
          reason: remove this
      """
    When I compute change list
    Then the change list has 2 entries

  Scenario: List shows correct line numbers for multi-line documents
    Given content for list:
      """
      First line.
      Second {++inserted++} line.
      Third line.
      Fourth {--deleted--} line.
      """
    When I compute change list
    Then the change list has 2 entries
    And change list entry 1 has line 2
    And change list entry 2 has line 4
