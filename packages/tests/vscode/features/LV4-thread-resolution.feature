@fast @LV4
Feature: LV4 — Thread resolution

  Resolving a thread marks the discussion complete without changing
  the change's status. Uses VS Code's native Resolved state.

  Scenario: Resolve thread sets resolved state
    Given a resolution document with a proposed insertion ct-1 with discussion
    When I resolve the thread for ct-1
    Then the thread state for ct-1 is "Resolved"
    And the resolution result footnote contains "resolved: @bob"

  Scenario: Resolved thread is still accessible
    Given a resolution document with a resolved insertion ct-1
    When I build resolution threads
    Then a resolution thread exists for "ct-1"
    And the thread state for ct-1 is "Resolved"

  Scenario: Unresolve thread restores Unresolved state
    Given a resolution document with a resolved insertion ct-1
    When I unresolve the thread for ct-1
    Then the thread state for ct-1 is "Unresolved"
    And the resolution result footnote does not contain "resolved:"

  Scenario: Resolution independent of change status
    Given a resolution document with an accepted insertion ct-1 with unresolved discussion
    When I build resolution threads
    Then the thread state for ct-1 is "Unresolved"
    And the resolution footnote status is "accepted"
