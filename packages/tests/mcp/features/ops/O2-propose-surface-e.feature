Feature: Propose changes via Surface E (committed view)
  As an AI agent using the committed view
  I want to read the file as if accepted changes are applied,
  then propose changes using hash-addressed coordinates
  So I can edit the "clean" version without seeing pending markup

  Background:
    Given a tracked markdown file "spec.md" with content:
      """
      # Spec

      timeout = 30
      retry = false
      """
    And the config has hashline.enabled = true
    And the config has protocol.mode = "classic"
    And the config has author.default = "ai:test-agent"

  Scenario: Read committed view then propose with line:hash
    When I call read_tracked_file with view = "committed"
    Then the response contains LINE:HASH coordinates per line
    And no CriticMarkup delimiters appear in the output
    When I call propose_change with:
      | file       | spec.md          |
      | start_line | <line of "timeout = 30"> |
      | start_hash | <hash of that line>      |
      | old_text   | timeout = 30     |
      | new_text   | timeout = 60     |
      | reasoning  | Increase for slow networks |
    Then the response contains change_id "cn-1"
    And the file contains "{~~timeout = 30~>timeout = 60~~}"

  Scenario: Propose insertion after a hash-addressed line
    When I call read_tracked_file with view = "committed"
    When I call propose_change with:
      | file       | spec.md          |
      | after_line | <line of "retry = false"> |
      | after_hash | <hash of that line>       |
      | old_text   |                  |
      | new_text   | max_retries = 3  |
      | reasoning  | Add retry limit  |
    Then the response type is "ins"
    And the file contains "{++max_retries = 3++}"

  Scenario: Completely wrong hash returns error
    When I call propose_change with start_hash = "zz"
    Then the response is an error
    And the error mentions "hash mismatch"

  Scenario: Chained edits update hash state
    When I call read_tracked_file with view = "committed"
    And I propose change 1 on line 3
    And I call read_tracked_file again with view = "committed"
    Then the hashes reflect the updated file (including new footnotes)
    When I propose change 2 on line 4
    Then both changes are in the file with sequential IDs

  Scenario: Committed view hides pending changes
    Given the file already has a pending substitution on "timeout = 30"
    When I call read_tracked_file with view = "committed"
    Then the output shows the ORIGINAL text "timeout = 30" (pending reverted)
    And pending changes are marked with [P] flags
    And accepted changes show their accepted text
