@core @move-operations
Feature: Move operations — dotted ID linking
  Move operations represent text moved from one location to another. They use
  dotted IDs (e.g., cn-1.1 for deletion, cn-1.2 for insertion) with a parent
  footnote of type "move". The parser assigns moveRole ('from'/'to') and groupId.

  Scenario: Move pairs are detected via dotted IDs
    Given the markup text with footnotes:
      """
      {--moved text--}[^cn-1.1] some middle text {++moved text++}[^cn-1.2]

      [^cn-1]: @alice | 2026-02-20 | move | proposed
      [^cn-1.1]: @alice | 2026-02-20 | del | proposed
      [^cn-1.2]: @alice | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then there are 2 changes
    And change 1 has move role "from"
    And change 1 has group id "cn-1"
    And change 2 has move role "to"
    And change 2 has group id "cn-1"

  Scenario: Non-move dotted IDs have no move role
    Given the markup text with footnotes:
      """
      {++first++}[^cn-2.1] then {++second++}[^cn-2.2]

      [^cn-2.1]: @alice | 2026-02-20 | ins | proposed
      [^cn-2.2]: @alice | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then there are 2 changes
    And change 1 has no move role
    And change 2 has no move role

  Scenario: Group members are retrievable via VirtualDocument
    Given the markup text with footnotes:
      """
      {--source--}[^cn-3.1] gap {++source++}[^cn-3.2]

      [^cn-3]: @bob | 2026-02-20 | move | proposed
      [^cn-3.1]: @bob | 2026-02-20 | del | proposed
      [^cn-3.2]: @bob | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    And I get group members for "cn-3"
    Then the group has 2 members

  Scenario: Move role from is assigned to deletion
    Given the markup text with footnotes:
      """
      {--gone--}[^cn-4.1] ... {++gone++}[^cn-4.2]

      [^cn-4]: @carol | 2026-02-20 | move | proposed
      [^cn-4.1]: @carol | 2026-02-20 | del | proposed
      [^cn-4.2]: @carol | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then change 1 is type "Deletion"
    And change 1 has move role "from"
    And change 2 is type "Insertion"
    And change 2 has move role "to"

  Scenario: Changes without footnotes have no group or move role
    Given the markup text "{++added++} and {--removed--}"
    When I parse the markup
    Then there are 2 changes
    And change 1 has no move role
    And change 1 has no group id
    And change 2 has no move role
    And change 2 has no group id

  # --- Additional move operation gap coverage ---

  Scenario: Multiple move groups handled independently
    Given the markup text with footnotes:
      """
      {--text A--}[^cn-1.1] gap {++text A++}[^cn-1.2] then {--text B--}[^cn-2.1] gap {++text B++}[^cn-2.2]

      [^cn-1]: @alice | 2026-02-20 | move | proposed
      [^cn-1.1]: @alice | 2026-02-20 | del | proposed
      [^cn-1.2]: @alice | 2026-02-20 | ins | proposed
      [^cn-2]: @bob | 2026-02-20 | move | proposed
      [^cn-2.1]: @bob | 2026-02-20 | del | proposed
      [^cn-2.2]: @bob | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then there are 4 changes
    And change 1 has move role "from"
    And change 1 has group id "cn-1"
    And change 2 has move role "to"
    And change 2 has group id "cn-1"
    And change 3 has move role "from"
    And change 3 has group id "cn-2"
    And change 4 has move role "to"
    And change 4 has group id "cn-2"

  Scenario: Orphan move parent — parent footnote with no children
    Given the markup text with footnotes:
      """
      Some plain text here.

      [^cn-5]: @carol | 2026-02-20 | move | proposed
      """
    When I parse the markup
    Then there are 0 changes
