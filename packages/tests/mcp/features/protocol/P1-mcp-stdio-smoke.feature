Feature: MCP stdio transport smoke tests
  As a plugin integrator
  I want to verify the full JSON-RPC transport works
  So I know the MCP server starts, handles requests, and returns valid responses

  Background:
    Given an MCP server process spawned via stdio transport
    And a temp project directory with config.toml

  Scenario: Server initializes and lists tools
    When I send a JSON-RPC "tools/list" request
    Then I receive a valid response with at least 7 tools
    And the tools include: read_tracked_file, propose_change, review_changes, resolve_thread, amend_change, list_changes, supersede_change

  Scenario: Full round-trip via stdio -- read -> propose -> review
    When I send read_tracked_file for a tracked file
    Then I receive content with no errors
    When I send propose_change with old_text/new_text
    Then I receive a response with change_id
    When I send review_changes approving the change
    Then I receive a success response
    And the file on disk reflects the settled change

  Scenario: Error responses are well-formed JSON-RPC
    When I send propose_change for a nonexistent file
    Then I receive a JSON-RPC error response
    And the error has a message field describing the problem

  Scenario: Backward-compat alias works via transport
    When I send a "propose_batch" tool call (unlisted alias)
    Then the server routes it correctly and returns grouped change IDs

  Scenario: Concurrent requests on same file
    When I send two propose_change requests in rapid succession
    Then both complete without corruption
    And the file contains both changes with sequential IDs
