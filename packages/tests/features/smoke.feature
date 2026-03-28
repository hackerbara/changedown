Feature: Smoke test
  Verify the Cucumber runner loads and step definitions wire correctly.

  Scenario: Propose a simple insertion via classic MCP
    Given a tracked markdown file "test.md" with content:
      """
      # Hello World

      This is a test document.
      """
    And the config has protocol.mode = "classic"
    When I call propose_change with:
      | file       | test.md                  |
      | old_text   |                          |
      | new_text   | A new paragraph.         |
      | insert_after | This is a test document. |
      | reasoning  | Add introductory content |
    Then the response contains change_id "cn-1"
    And the response type is "ins"
    And the file contains "{++A new paragraph.++}"
    And the file contains a footnote "[^cn-1]" with status "proposed"
