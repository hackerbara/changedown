@fast @parser @OVL1
Feature: OVL1 — VirtualDocument.fromOverlayOnly

  Tests that VirtualDocument.fromOverlayOnly creates a synthetic insertion
  ChangeNode from a pending overlay (LSP-disconnected fallback path).

  Scenario: fromOverlayOnly creates insertion at start
    Given a pending overlay with range 0 to 5 and text "hello"
    When I create a VirtualDocument from overlay only
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has modified text "hello"
    And change 1 range starts at 0
    And change 1 range ends at 5
    And change 1 has status "proposed"

  Scenario: fromOverlayOnly uses scId when provided
    Given a pending overlay with range 10 to 18 and text "inserted" and scId "cn-17"
    When I create a VirtualDocument from overlay only
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has id "cn-17"

  Scenario: fromOverlayOnly generates id when scId not provided
    Given a pending overlay with range 3 to 7 and text "xy"
    When I create a VirtualDocument from overlay only
    Then the parser finds 1 change
    And change 1 has id "cn-pending-3"
