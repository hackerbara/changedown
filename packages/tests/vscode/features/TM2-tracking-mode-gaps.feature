@coverage-gap @slow
Feature: TM2 — Tracking Mode Coverage Gaps

  TM2-01 and TM2-02 verify BUG-6 fix (undo/redo pending buffer cleanup).
  TM2-03 through TM2-06 document known untested behaviors (still @wip).

  @fixture(tracking-mode-test)
  Scenario: TM2-01 Undo reverses tracked insertion
    Given a tracking-mode editor with content "Hello world"
    When I type " beautiful"
    And I wait for edit boundary detection
    Then the document contains "{++ beautiful++}"
    When I press "Meta+z"
    And I wait for edit boundary detection
    Then the document does not contain "{++"
    And the document contains "Hello world"

  @fixture(tracking-mode-test)
  Scenario: TM2-02 Redo re-applies tracked insertion
    Given a tracking-mode editor with content "Hello world"
    When I type " beautiful"
    And I wait for edit boundary detection
    And I press "Meta+z"
    And I press "Meta+Shift+z"
    And I wait for edit boundary detection
    Then the document contains "{++ beautiful++}"

  @wip @red @fixture(tracking-mode-test)
  Scenario: TM2-03 Select-then-type creates substitution
    Given a tracking-mode editor with content "Hello world"
    When I select from line 1 column 6 to line 1 column 11
    And I type "universe"
    And I wait for edit boundary detection
    Then the document contains "{~~world~>universe~~}"

  @wip @red @fixture(tracking-mode-test)
  Scenario: TM2-04 Find-and-replace creates tracked change
    Given a tracking-mode editor with content "Hello world"
    When I press "Meta+h"
    And I type "world"
    And I press "Tab"
    And I type "universe"
    And I press "Enter"
    And I press "Escape"
    And I wait for edit boundary detection
    Then the document contains "{~~world~>universe~~}"
    # Or possibly {--world--}{++universe++} depending on implementation

  @wip @red @fixture(tracking-mode-test)
  Scenario: TM2-05 Arrow key flushes pending edit
    Given a tracking-mode editor with content "Hello world"
    When I type " there"
    And I press "ArrowLeft"
    Then the document contains "{++ there++}"

  @wip @red @fixture(tracking-mode-test)
  Scenario: TM2-06 J5 timing — 2500ms wait does NOT flush with 30000ms threshold
    Given a tracking-mode editor with content "Hello world"
    When I type " test"
    And I wait 2500 milliseconds
    Then the document does not contain "{++"
    # This documents the timing mismatch: 2500ms < 30000ms production threshold
