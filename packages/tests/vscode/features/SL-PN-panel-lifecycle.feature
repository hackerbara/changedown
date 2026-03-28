@slow @SL-PN @destructive @wip @red
Feature: SL-PN — Review panel lifecycle in running VS Code

  Background:
    Given VS Code is launched with fixture "lifecycle-panel.md"
    And the extension has finished parsing
    And I open the Review Panel

  @SL-PN-01
  Scenario: Panel shows cards for all changes
    Then the panel shows 5 change cards
    And I capture evidence screenshot "panel-all-cards"

  @SL-PN-02
  Scenario: Cards show correct type and status badges
    Then the card for cn-1 shows type "insertion" and status "proposed"
    And the card for cn-2 shows type "substitution" and status "proposed"
    And the card for cn-3 shows type "insertion" and status "accepted"
    And the card for cn-4 shows type "deletion" and status "rejected"
    And the card for cn-5 shows type "highlight" and status "proposed"

  @SL-PN-03
  Scenario: Card click navigates to change location
    When I click the card for cn-3
    Then the cursor is on the line containing "accepted change"
    And I capture evidence screenshot "panel-navigate-to-change"

  @SL-PN-04
  Scenario: Accept from panel button
    When I click Accept on the card for cn-1
    And I select QuickPick item "Accept"
    Then the panel card for cn-1 shows status "accepted"
    And the document footnote for cn-1 contains "approved:"
    And I capture evidence screenshot "panel-after-accept"

  @SL-PN-05
  Scenario: Filter to proposed only
    When I set panel filter to "proposed"
    Then the panel shows 3 change cards
    And the visible cards are cn-1, cn-2, cn-5
    And I capture evidence screenshot "panel-filter-proposed"

  @SL-PN-06
  Scenario: Filter to unresolved only
    When I set panel filter to "unresolved"
    Then the panel does not show cn-3
    And I capture evidence screenshot "panel-filter-unresolved"

  @SL-PN-07
  Scenario: Hover preview shows discussion summary
    When I hover over the card for cn-2
    Then the preview shows reply count and author
    And the preview shows discussion text "Why rename?"
    And I capture evidence screenshot "panel-hover-preview"
