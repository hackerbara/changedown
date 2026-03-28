@fast @navigation @NAV1
Feature: NAV1 -- Navigation between changes
  Port of Navigation.test.ts (6 mocha tests).
  Tests the core nextChange / previousChange functions from @changedown/core.
  These operate on a VirtualDocument and a cursor offset, returning the
  ChangeNode to navigate to.

  Background:
    Given a navigation document with text:
      """
      # Test Document

      This is some text {++with an insertion++} here.

      And another line {--with a deletion--} there.

      {~~Old text~>New text~~} replacement here.

      {==Highlighted text==}{>>This is a comment<<}

      Final line without changes.
      """

  # ── nextChange ──────────────────────────────────────────────────────

  Scenario: nextChange navigates to first change from beginning
    Given the navigation cursor is at offset 0
    When I run nextChange from the cursor
    Then the navigation target is change 1
    And the navigation target starts on line 2

  Scenario: nextChange navigates through all changes in order
    Given the navigation cursor is at offset 0
    When I run nextChange from the cursor
    Then the navigation target is change 1
    When I advance the cursor past the navigation target
    And I run nextChange from the cursor
    Then the navigation target is change 2
    When I advance the cursor past the navigation target
    And I run nextChange from the cursor
    Then the navigation target is change 3

  Scenario: nextChange wraps to first change when at end
    Given the navigation cursor is at end of document
    When I run nextChange from the cursor
    Then the navigation target is change 1

  # ── previousChange ─────────────────────────────────────────────────

  Scenario: previousChange navigates backwards
    Given the navigation cursor is at offset 150
    When I run previousChange from the cursor
    Then the navigation target starts before offset 150

  Scenario: previousChange wraps to last change when at beginning
    Given the navigation cursor is at offset 0
    When I run previousChange from the cursor
    Then the navigation target is the last change

  # ── Edge case: no changes ──────────────────────────────────────────

  Scenario: Navigation returns null for document with no changes
    Given a navigation document with text:
      """
      Just plain text without any CriticMarkup
      """
    And the navigation cursor is at offset 0
    When I run nextChange from the cursor
    Then no navigation target is found

  # ── PB-22: previousChange must skip the change the cursor is inside ─

  Scenario: previousChange skips change cursor is inside
    Given the navigation cursor is at offset 90
    When I run previousChange from the cursor
    Then the navigation target is change 1
    # Offset 90 is inside change 2 (deletion {--with a deletion--}, start=83 end=104).
    # previousChange must skip it and return change 1 (the insertion).

  Scenario: previousChange from inside first change wraps past it
    Given the navigation cursor is at offset 40
    When I run previousChange from the cursor
    Then the navigation target is the last change
    # Offset 40 is inside change 1 (insertion {++with an insertion++}, start=35 end=58).
    # No change before it, so previousChange wraps to the last change in the document.

  # PB-23 FIXED: Controller now shows "Wrapped to first/last change" notification
  # on wrap-around. Verification requires @slow Playwright test (future coverage).
