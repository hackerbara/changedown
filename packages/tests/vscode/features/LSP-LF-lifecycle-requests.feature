@fast @LSP-LF
Feature: LSP-LF — Lifecycle LSP custom requests

  Tests for LSP custom requests defined in Plan A Phase 2.
  Each test sends a request to the LSP server and verifies
  the returned edit or error response.

  Background:
    Given an LSP server instance with a test document

  Scenario: LSP-LF-01 reviewChange returns edit with approval line
    Given the test document contains a proposed ct-1 insertion
    When I send changetracks/reviewChange with changeId "ct-1", decision "approve", author "@bob"
    Then the response contains an edit
    And the edit text contains "approved:"
    And the edit text contains "| accepted"

  Scenario: LSP-LF-02 reviewChange with request-changes keeps status proposed
    Given the test document contains a proposed ct-1 insertion
    When I send changetracks/reviewChange with changeId "ct-1", decision "request_changes", reason "Needs work", author "@bob"
    Then the response contains an edit
    And the edit adds "request-changes:" with reason "Needs work"
    And the edit does NOT change ct-1 footnote status from "proposed"

  Scenario: LSP-LF-03 replyToThread appends to footnote block
    Given the test document contains a proposed ct-1 insertion with existing discussion
    When I send changetracks/replyToThread with changeId "ct-1", text "Good point", author "@carol"
    Then the response contains an edit
    And the edit text contains "@carol"
    And the edit text contains "Good point"

  Scenario: LSP-LF-04 replyToThread on L0 change promotes to L2 first
    Given the test document contains an L0 insertion with no footnote
    When I promote the L0 change at offset 6 then reply with text "Question", author "@bob"
    Then the response contains an edit
    And the edit text contains a footnote reference
    And the edit text contains a footnote block
    And the edit text contains "@bob"
    And the edit text contains "Question"

  Scenario: LSP-LF-05 amendChange returns edits for inline + footnote revision
    Given the test document contains a proposed ct-1 insertion by "@alice"
    When I send changetracks/amendChange with changeId "ct-1", newText "improved text", reason "Better wording", author "@alice"
    Then the response contains an edit
    And the edit text contains "{++improved text++}"
    And the edit text contains "revised"
    And the edit text contains "Better wording"

  Scenario: LSP-LF-06 amendChange rejects wrong-author
    Given the test document contains a proposed ct-1 insertion by "@alice"
    When I send changetracks/amendChange with changeId "ct-1", newText "hijack", author "@bob"
    Then the response contains an error
    And the error message contains "are not the original author"

  Scenario: LSP-LF-07 supersedeChange returns reject + new proposal edits
    Given the test document contains a proposed ct-1 substitution by "@alice"
    When I send changetracks/supersedeChange with changeId "ct-1", newText "better approach", oldText "old text", reason "Cleaner design", author "@bob"
    Then the response contains an edit and a new change ID
    And the edit text contains "| rejected"
    And the edit text contains "supersedes:"
    And the edit text contains "superseded-by:"

  Scenario: LSP-LF-08 resolveThread adds resolution line
    Given the test document contains a proposed ct-1 insertion with existing discussion
    When I send changetracks/resolveThread with changeId "ct-1", author "@bob"
    Then the response contains an edit
    And the edit text contains "resolved:"
    And the edit text contains "@bob"

  Scenario: LSP-LF-09 unresolveThread removes resolution line
    Given the test document contains a resolved ct-1
    When I send changetracks/unresolveThread with changeId "ct-1"
    Then the response contains an edit
    And the edit text does not contain "resolved:"

  Scenario: LSP-LF-10 compactChange on accepted returns level-descent edit
    Given the test document contains an accepted ct-1 insertion
    When I send changetracks/compactChange with changeId "ct-1", fully true
    Then the response contains an edit
    And the edit text does not contain "[^ct-1]:"
    And the edit text does not contain "[^ct-1]"

  Scenario: LSP-LF-11 compactChange on proposed returns error
    Given the test document contains a proposed ct-1 insertion
    When I send changetracks/compactChange with changeId "ct-1"
    Then the response contains an error
    And the error message contains "proposed"

  Scenario: LSP-LF-12 getProjectConfig returns reasonRequired settings
    When I send changetracks/getProjectConfig
    Then the config response contains reasonRequired.agent = true
    And the config response contains reasonRequired.human = false
