@fast @ORT1
Feature: ORT-1 — Optimistic range transform for decoration cache
  The extension adjusts cached ChangeNode ranges by edit deltas so
  decorations stay visually stable during the LSP round-trip.

  # --- transformRange unit tests ---

  Scenario: Edit before a range shifts both start and end
    Given a range from offset 10 to 20
    When an edit inserts 5 characters at offset 3
    Then the range is from offset 15 to 25

  Scenario: Edit after a range does not change it
    Given a range from offset 10 to 20
    When an edit inserts 5 characters at offset 25
    Then the range is from offset 10 to 20

  Scenario: Edit inside a range expands end only
    Given a range from offset 10 to 20
    When an edit inserts 3 characters at offset 15
    Then the range is from offset 10 to 23

  Scenario: Deletion inside a range contracts end
    Given a range from offset 10 to 20
    When an edit deletes 4 characters at offset 12
    Then the range is from offset 10 to 16

  Scenario: Edit spanning range boundary clamps
    Given a range from offset 10 to 20
    When an edit deletes 15 characters at offset 8
    Then the range is from offset 10 to 10

  Scenario: Deletion before a range shifts left
    Given a range from offset 10 to 20
    When an edit deletes 3 characters at offset 2
    Then the range is from offset 7 to 17

  # --- transformCachedDecorations integration ---

  Scenario: Transform adjusts all cached nodes for a single insert
    Given cached decoration data for "file:///test.md" with ranges 5-15 and 20-30
    When transformCachedDecorations is called with an insert of 3 chars at offset 10
    Then the cached ranges are 5-18 and 23-33

  Scenario: Transform contracts a range to zero width when deletion spans its end
    Given cached decoration data for "file:///test.md" with ranges 5-10 and 20-30
    When transformCachedDecorations is called with a delete of 8 chars at offset 3
    Then the cached ranges are 5-5 and 12-22

  Scenario: Transform returns false for empty cache
    Given no cached decoration data for "file:///test.md"
    When transformCachedDecorations is called with an insert of 3 chars at offset 0
    Then transformCachedDecorations returns false
