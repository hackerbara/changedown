Feature: Propose changes via Surface B (classic MCP)
  As an AI agent using the classic protocol
  I want to propose insertions, deletions, and substitutions via old_text/new_text
  So that my editorial suggestions are tracked with full deliberation metadata

  Background:
    Given a tracked markdown file "design.md" with content:
      """
      # API Design

      The API uses REST for the public interface.
      Authentication uses API keys for all endpoints.
      Rate limiting is set to 100 requests per minute.
      """
    And the config has protocol.mode = "classic"
    And the config has author.default = "ai:test-agent"

  # --- Insertions ---

  Scenario: Insert text after anchor
    When I call propose_change with:
      | file     | design.md                          |
      | old_text |                                    |
      | new_text | Pagination defaults to 50 results. |
      | insert_after | Rate limiting is set to 100 requests per minute. |
      | reasoning | API needs pagination for list endpoints |
    Then the response contains change_id "ct-1"
    And the response type is "ins"
    And the file contains "{++Pagination defaults to 50 results.++}"
    And the file contains a footnote "[^ct-1]" with status "proposed"
    And the footnote contains the reasoning "API needs pagination for list endpoints"

  Scenario: Insert text with empty old_text (beginning of match context)
    When I call propose_change with:
      | file     | design.md |
      | old_text |           |
      | new_text | > Draft   |
      | insert_after | # API Design |
      | reasoning | Mark as draft |
    Then the response contains change_id "ct-1"
    And the file contains "{++> Draft++}"

  # --- Deletions ---

  Scenario: Delete text by providing empty new_text
    When I call propose_change with:
      | file     | design.md                          |
      | old_text | Rate limiting is set to 100 requests per minute. |
      | new_text |                                    |
      | reasoning | Rate limiting handled by API gateway |
    Then the response type is "del"
    And the file contains "{--Rate limiting is set to 100 requests per minute.--}"

  # --- Substitutions ---

  Scenario: Substitute text
    When I call propose_change with:
      | file     | design.md       |
      | old_text | REST            |
      | new_text | GraphQL         |
      | reasoning | GraphQL gives clients query flexibility |
    Then the response type is "sub"
    And the file contains "{~~REST~>GraphQL~~}"

  Scenario: Multi-line substitution
    When I call propose_change with:
      | file     | design.md |
      | old_text | Authentication uses API keys for all endpoints.\nRate limiting is set to 100 requests per minute. |
      | new_text | Authentication uses OAuth2 with JWT tokens.\nRate limiting is set to 1000 requests per minute. |
      | reasoning | Security upgrade |
    Then the response type is "sub"
    And the file contains the multi-line substitution markup

  # --- Metadata & author ---

  Scenario: Reasoning is recorded in footnote
    When I call propose_change with reasoning "Security concern: API keys are insecure"
    Then the footnote for the change contains "Security concern: API keys are insecure"

  Scenario: Author is recorded from config default
    When I call propose_change without an explicit author
    Then the footnote header contains "@ai:test-agent"

  Scenario: Explicit author overrides config
    When I call propose_change with author "ai:reviewer-bot"
    Then the footnote header contains "@ai:reviewer-bot"

  # --- Error cases ---

  Scenario: Ambiguous old_text match returns error
    Given the file contains "the" appearing 3 times
    When I call propose_change with old_text "the"
    Then the response is an error
    And the error message mentions "ambiguous" or "multiple matches"

  Scenario: old_text not found returns error
    When I call propose_change with old_text "NONEXISTENT TEXT"
    Then the response is an error
    And the error message mentions "not found"

  Scenario: File outside tracking scope returns error
    Given a file "README.txt" outside the include pattern
    When I call propose_change on "README.txt"
    Then the response is an error

  # --- Sequential changes ---

  Scenario: Two sequential changes get incrementing IDs
    When I call propose_change with old_text "REST" and new_text "GraphQL"
    And I call propose_change with old_text "API keys" and new_text "OAuth2"
    Then the first change has id "ct-1"
    And the second change has id "ct-2"
    And the file contains both "[^ct-1]" and "[^ct-2]"

  # --- Raw mode ---

  Scenario: Raw mode bypasses CriticMarkup wrapping
    Given the config has policy.mode = "permissive"
    When I call propose_change with raw = true
    Then the file does NOT contain CriticMarkup delimiters
    And the replacement is applied directly

  Scenario: Raw mode denied in strict policy
    Given the config has policy.mode = "strict"
    When I call propose_change with raw = true
    Then the response is an error
    And the error mentions "policy"

  # --- affected_lines windowing ---

  Scenario: Single-change affected_lines returns bounded window in classic mode
    Given a tracked file with 50+ lines
    And the config has hashline.enabled = false
    And the config has response.affected_lines = true
    When I call propose_change substituting one word in the middle of the file
    Then affected_lines contains fewer than 20 entries
    And affected_lines includes the edit region with context
    But affected_lines does NOT contain the entire file
