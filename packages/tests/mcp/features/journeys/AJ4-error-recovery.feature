Feature: Error recovery and resilience
  As an AI agent working with tracked files
  I want graceful error handling and recovery paths
  So I can continue working when things go wrong

  Background:
    Given a tracked file "doc.md" with content:
      """
      # Error Recovery Test

      This document has hello world content.
      It also has some additional text for testing.
      """
    And the config has hashline.enabled = true

  Scenario: Stale hash -- re-read and retry
    When I read the committed view and record hashes
    And the file is externally rewritten (another agent replaces all content)
    And I try to propose a change with the recorded stale hashes
    Then the response is an error (old_text not found at stale line reference)
    When I re-read the committed view to get fresh hashes
    And I retry the propose with updated coordinates
    Then the change is applied successfully

  Scenario: File deleted between read and propose
    When I read the file successfully
    And the file is deleted from disk
    And I try to propose a change
    Then the response is an error
    And the error mentions the file not being found

  Scenario: Propose on already-changed text (concurrent edit via committed-text cascade)
    When agent B proposes a change on a phrase in the document
    And agent A proposes a change on overlapping text (resolved via committed-text cascade)
    Then both changes coexist in the document
    And the document has 2 footnotes

  Scenario: Policy block on strict mode
    Given the config has policy.mode = "strict"
    When I try to use raw = true on propose_change
    Then the response is an error mentioning "policy" and "strict"
    When I retry without raw = true
    Then the change is applied normally with CriticMarkup

  Scenario: Invalid change_id in review
    Given a proposed change cn-1 exists
    When I call review_changes with change_id "cn-999"
    Then the response contains a per-change error (not a top-level crash)
    And the error mentions "not found"
    When I review the valid change cn-1
    Then the review succeeds

  Scenario: Author enforcement in required mode
    Given the config has author.enforcement = "required"
    And the config has author.default = "" (empty)
    When I call propose_change without an author parameter
    Then the response is an error mentioning "author" and "required"
    When I retry with an explicit author
    Then the change is applied with the specified author in the footnote

  Scenario: Unicode characters are preserved — en-dash is distinct from ASCII hyphen
    Given the file contains an en-dash (U+2013) in place of ASCII hyphen
    When I call propose_change with old_text using the exact en-dash (U+2013)
    Then the match succeeds via exact matching
    And the change is applied with the original Unicode text preserved in markup
