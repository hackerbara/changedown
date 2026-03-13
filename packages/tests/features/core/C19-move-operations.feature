@core @move-operations
Feature: Move operations — dotted ID linking
  Move operations represent text moved from one location to another. They use
  dotted IDs (e.g., ct-1.1 for deletion, ct-1.2 for insertion) with a parent
  footnote of type "move". The parser assigns moveRole ('from'/'to') and groupId.

  Scenario: Move pairs are detected via dotted IDs
    Given the markup text with footnotes:
      """
      {--moved text--}[^ct-1.1] some middle text {++moved text++}[^ct-1.2]

      [^ct-1]: @alice | 2026-02-20 | move | proposed
      [^ct-1.1]: @alice | 2026-02-20 | del | proposed
      [^ct-1.2]: @alice | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then there are 2 changes
    And change 1 has move role "from"
    And change 1 has group id "ct-1"
    And change 2 has move role "to"
    And change 2 has group id "ct-1"

  Scenario: Non-move dotted IDs have no move role
    Given the markup text with footnotes:
      """
      {++first++}[^ct-2.1] then {++second++}[^ct-2.2]

      [^ct-2.1]: @alice | 2026-02-20 | ins | proposed
      [^ct-2.2]: @alice | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then there are 2 changes
    And change 1 has no move role
    And change 2 has no move role

  Scenario: Group members are retrievable via VirtualDocument
    Given the markup text with footnotes:
      """
      {--source--}[^ct-3.1] gap {++source++}[^ct-3.2]

      [^ct-3]: @bob | 2026-02-20 | move | proposed
      [^ct-3.1]: @bob | 2026-02-20 | del | proposed
      [^ct-3.2]: @bob | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    And I get group members for "ct-3"
    Then the group has 2 members

  Scenario: Move role from is assigned to deletion
    Given the markup text with footnotes:
      """
      {--gone--}[^ct-4.1] ... {++gone++}[^ct-4.2]

      [^ct-4]: @carol | 2026-02-20 | move | proposed
      [^ct-4.1]: @carol | 2026-02-20 | del | proposed
      [^ct-4.2]: @carol | 2026-02-20 | ins | proposed
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
      {--text A--}[^ct-1.1] gap {++text A++}[^ct-1.2] then {--text B--}[^ct-2.1] gap {++text B++}[^ct-2.2]

      [^ct-1]: @alice | 2026-02-20 | move | proposed
      [^ct-1.1]: @alice | 2026-02-20 | del | proposed
      [^ct-1.2]: @alice | 2026-02-20 | ins | proposed
      [^ct-2]: @bob | 2026-02-20 | move | proposed
      [^ct-2.1]: @bob | 2026-02-20 | del | proposed
      [^ct-2.2]: @bob | 2026-02-20 | ins | proposed
      """
    When I parse the markup
    Then there are 4 changes
    And change 1 has move role "from"
    And change 1 has group id "ct-1"
    And change 2 has move role "to"
    And change 2 has group id "ct-1"
    And change 3 has move role "from"
    And change 3 has group id "ct-2"
    And change 4 has move role "to"
    And change 4 has group id "ct-2"

  Scenario: Orphan move parent — parent footnote with no children
    Given the markup text with footnotes:
      """
      Some plain text here.

      [^ct-5]: @carol | 2026-02-20 | move | proposed
      """
    When I parse the markup
    Then there are 0 changes
