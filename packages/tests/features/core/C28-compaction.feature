@C28
Feature: L3 Compaction
  As a document author
  I want to compact decided changes out of the footnote log
  So that the file carries only the editorial history I choose

  Background:
    Given the hashline module is initialized

  Scenario: Compact all decided changes
    Given an L3 document with 2 accepted and 1 proposed change
    When I compact all decided changes
    Then the decided footnotes are removed
    And the proposed footnote is preserved
    And a compaction-boundary footnote exists

  Scenario: Compact with auto-accept of proposed changes
    Given an L3 document with 1 proposed insertion
    When I compact with undecided policy "accept"
    Then the insertion text remains in the body
    And the footnote is removed

  Scenario: Compact with auto-reject of proposed changes
    Given an L3 document with 1 proposed insertion
    When I compact with undecided policy "reject"
    Then the insertion text is removed from the body
    And the footnote is removed

  Scenario: Supersede chain compaction
    Given an L3 document with a supersede chain ct-1 to ct-2
    When I compact ct-2
    Then both ct-1 and ct-2 are compacted
    And the compacted file is self-sufficient

  Scenario: Multiple compaction events produce multiple boundaries
    Given an L3 document that has already been compacted once
    And new decided changes exist after the first compaction
    When I compact the new decided changes
    Then two compaction-boundary footnotes exist

  Scenario: Boundary metadata is preserved
    Given an L3 document with 1 accepted change
    When I compact with boundary metadata note "Sprint cleanup"
    Then the boundary footnote contains "note: Sprint cleanup"
