Feature: C9 - Hashline Computation
  The hashline module provides content-addressed line references using xxHash32.
  Each line gets a 2-char lowercase hex hash. The system supports parsing
  LINE:HASH references, formatting lines with hashes, and validating references
  against actual file content.

  Background:
    Given the hashline module is initialized

  # --- computeLineHash ---

  Scenario: Hash is a 2-char lowercase hex string
    When I compute the hash of "hello" at index 0
    Then the hash is a valid 2-char hex string

  Scenario: Empty line produces a consistent hash
    When I compute the hash of "" at index 0
    Then the hash is a valid 2-char hex string
    And the hash of "" at index 0 equals the hash of "" at index 1

  Scenario: Line index does not affect hash value
    Then the hash of "hello world" at index 0 equals the hash of "hello world" at index 5

  Scenario: Trailing carriage return is stripped before hashing
    Then the hash of "hello\r" at index 0 equals the hash of "hello" at index 0

  Scenario: All whitespace is stripped before hashing
    Then the hash of "helloworld" at index 0 equals the hash of "hello world" at index 0
    And the hash of "helloworld" at index 0 equals the hash of "hello\tworld" at index 0
    And the hash of "helloworld" at index 0 equals the hash of "  hello  world  " at index 0

  Scenario: Different content produces different hashes
    Then the hash of "hello" at index 0 does not equal the hash of "goodbye" at index 0

  Scenario: Whitespace-only line hashes same as empty
    Then the hash of "" at index 0 equals the hash of "   " at index 0
    And the hash of "" at index 0 equals the hash of "\t\t" at index 0

  Scenario: Unicode content produces valid hash
    When I compute the hash of "unicode-jp" at index 0
    Then the hash is a valid 2-char hex string

  # --- formatHashLines ---

  Scenario: Format single line with hash
    When I format hash lines for "hello"
    Then the formatted output line 1 is a valid hashline for "hello"

  Scenario: Format multiple lines
    When I format hash lines for "aaa\nbbb\nccc"
    Then the formatted output has 3 lines
    And the formatted output line 1 starts with "1:"
    And the formatted output line 2 starts with "2:"
    And the formatted output line 3 starts with "3:"

  Scenario: Custom start line number
    When I format hash lines for "aaa\nbbb" starting at line 10
    Then the formatted output line 1 starts with "10:"
    And the formatted output line 2 starts with "11:"

  Scenario: Empty content formats as single empty line
    When I format hash lines for ""
    Then the formatted output has 1 lines
    And the formatted output line 1 starts with "1:"

  Scenario: Trailing newline produces trailing empty line
    When I format hash lines for "aaa\n"
    Then the formatted output has 2 lines
    And the formatted output line 2 starts with "2:"

  # --- parseLineRef ---

  Scenario: Parse simple ref
    When I parse line ref "5:a3"
    Then the parsed line is 5
    And the parsed hash is "a3"

  Scenario: Parse ref with pipe content suffix
    When I parse line ref "5:a3|content here"
    Then the parsed line is 5
    And the parsed hash is "a3"

  Scenario: Parse ref with double-space content suffix
    When I parse line ref "5:a3  content here"
    Then the parsed line is 5
    And the parsed hash is "a3"

  Scenario: Whitespace around colon is normalized
    When I parse line ref "5 : a3"
    Then the parsed line is 5
    And the parsed hash is "a3"

  Scenario: Large line numbers
    When I parse line ref "9999:00"
    Then the parsed line is 9999
    And the parsed hash is "00"

  Scenario: Uppercase hex in hash
    When I parse line ref "3:AB"
    Then the parsed line is 3
    And the parsed hash is "AB"

  Scenario: Prefix match fallback for non-hex suffix
    When I parse line ref "5:a3xyz"
    Then the parsed line is 5
    And the parsed hash is "a3"

  Scenario: Invalid format throws error
    Then parsing line ref "not a ref" throws an invalid ref error

  Scenario: Missing colon throws error
    Then parsing line ref "5a3" throws an invalid ref error

  Scenario: Line number below 1 throws error
    Then parsing line ref "0:a3" throws a line-must-be-positive error

  Scenario: Negative line number throws error
    Then parsing line ref "-1:a3" throws an invalid ref error

  Scenario: Empty hash throws error
    Then parsing line ref "5:" throws an invalid ref error

  Scenario: Single-char hash throws error
    Then parsing line ref "5:a" throws an invalid ref error

  # --- validateLineRef ---

  Scenario: Validation passes when hash matches
    Given file lines "hello" and "world"
    When I validate line ref 1 against the file lines
    Then the validation passes

  Scenario: Validation passes with case-insensitive hash comparison
    Given file lines "hello" and "world"
    When I validate line ref 1 with uppercase hash against the file lines
    Then the validation passes

  Scenario: Validation throws on out-of-range line
    Given file lines "hello" and "world"
    Then validating line ref 3 against the file lines throws an Error
