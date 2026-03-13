Feature: H4 - Edit Tracker
  The edit tracker classifies edits by type (creation, insertion, deletion,
  substitution) and determines whether edits should be logged based on
  the policy mode.

  # ── Edit Classification ──

  Scenario: Write tool is classified as creation
    When I classify an edit with tool "Write" old "" new "new content"
    Then the edit class is "creation"

  Scenario: Empty old text with non-empty new text is classified as insertion
    When I classify an edit with tool "Edit" old "" new "inserted text"
    Then the edit class is "insertion"

  Scenario: Non-empty old text with empty new text is classified as deletion
    When I classify an edit with tool "Edit" old "deleted text" new ""
    Then the edit class is "deletion"

  Scenario: Both old and new non-empty is classified as substitution
    When I classify an edit with tool "Edit" old "old" new "new"
    Then the edit class is "substitution"

  # ── Should-Log Decision ──

  Scenario: Safety-net mode enables edit logging
    When I check if edits should be logged in "safety-net" mode
    Then edit logging is enabled

  Scenario: Strict mode disables edit logging
    When I check if edits should be logged in "strict" mode
    Then edit logging is disabled

  Scenario: Permissive mode disables edit logging
    When I check if edits should be logged in "permissive" mode
    Then edit logging is disabled
