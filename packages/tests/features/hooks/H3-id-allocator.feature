Feature: H3 - ID Allocator
  The ID allocator scans existing SC-IDs in file content and allocates
  new sequential IDs. Single edits get flat IDs (ct-N), multiple edits
  get dotted IDs under a parent (ct-N.1, ct-N.2).

  # ── Scanning Existing IDs ──

  Scenario: Finds the maximum SC-ID in text
    Given text containing "[^ct-3] and [^ct-7] here [^ct-2]"
    When I scan for the max SC-ID
    Then the max ID is 7

  Scenario: Returns zero when no SC-IDs exist
    Given text containing "no ids here"
    When I scan for the max SC-ID
    Then the max ID is 0

  Scenario: Handles dotted IDs and returns the parent number
    Given text containing "[^ct-5.1] [^ct-5.2] [^ct-3]"
    When I scan for the max SC-ID
    Then the max ID is 5

  Scenario: Handles mixed flat and dotted IDs
    Given text containing "[^ct-10] [^ct-3.1] [^ct-3.2]"
    When I scan for the max SC-ID
    Then the max ID is 10

  # ── Allocating New IDs ──

  Scenario: Allocates a flat ID for a single edit
    Given a max existing ID of 5
    When I allocate IDs for 1 edit
    Then the allocated IDs are "ct-6"

  Scenario: Allocates dotted IDs for multiple edits
    Given a max existing ID of 5
    When I allocate IDs for 3 edit
    Then the allocated IDs are "ct-6.1,ct-6.2,ct-6.3"

  Scenario: Allocates from zero when no existing IDs
    Given a max existing ID of 0
    When I allocate IDs for 1 edit
    Then the allocated IDs are "ct-1"

  Scenario: Allocates dotted IDs from zero for multiple edits
    Given a max existing ID of 0
    When I allocate IDs for 2 edit
    Then the allocated IDs are "ct-1.1,ct-1.2"

  Scenario: Allocates zero IDs for zero count
    Given a max existing ID of 5
    When I allocate IDs for 0 edit
    Then the allocated IDs are empty

  Scenario: Dotted IDs use consecutive child numbers
    Given a max existing ID of 2
    When I allocate IDs for 4 edit
    Then the allocated IDs are "ct-3.1,ct-3.2,ct-3.3,ct-3.4"
