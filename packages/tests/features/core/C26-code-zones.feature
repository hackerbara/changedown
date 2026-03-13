@core @code-zones @C26
Feature: C26 — Code Zones Parser

  The code zones parser (`findCodeZones`) performs a single-pass O(n) scan
  of markdown text and returns `CodeZone[]` objects identifying fenced code
  blocks and inline code spans. Supporting functions `tryMatchFenceOpen`,
  `tryMatchFenceClose`, and `skipInlineCode` handle the low-level matching.

  # --- findCodeZones — fenced blocks ---

  Scenario: No code in text returns empty array
    Given the code zones input is "Hello world"
    When I find code zones
    Then the code zones count is 0

  Scenario: Single backtick fence detected
    Given the code zones input is:
      """
      ```
      code here
      ```
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Single tilde fence detected
    Given the code zones input is:
      """
      ~~~
      code here
      ~~~
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Fence with info string
    Given the code zones input is:
      """
      ```python
      print("hi")
      ```
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Fence with 0-3 leading spaces
    Given the code zones input is:
      """
         ```
      code
         ```
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: 4+ leading spaces is NOT a fence
    Given the code zones input is:
      """
          ```
      not a fence
          ```
      """
    When I find code zones
    # Not a fence — but backtick runs match as inline code
    Then the code zones count is 1
    And code zone 1 has type "inline"

  Scenario: Closing fence needs >= opening length
    Given the code zones input is:
      """
      ````
      content
      ````
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Shorter closing fence does not close
    Given the code zones input is:
      """
      ````
      still open
      ```
      still open
      ````
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Unclosed fence extends to end of document
    Given the code zones input is:
      """
      ```
      everything is code
      no close marker
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Multiple fenced blocks
    Given the code zones input is:
      """
      ```
      block one
      ```
      between
      ```
      block two
      ```
      """
    When I find code zones
    Then the code zones count is 2
    And code zone 1 has type "fence"
    And code zone 2 has type "fence"

  Scenario: Empty fenced block
    Given the code zones input is:
      """
      ```
      ```
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Backtick fence rejects backticks in info string
    Given the code zones input is:
      """
      ``` `js
      not a fence
      ```
      """
    When I find code zones
    # The opening line is invalid (backtick in info string), so backtick runs
    # match as inline code instead
    Then the code zones count is 1
    And code zone 1 has type "inline"

  # --- findCodeZones — inline code ---

  Scenario: Single backtick inline code
    Given the code zones input is "text `code` more"
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "inline"
    And code zone 1 starts at 5
    And code zone 1 ends at 11

  Scenario: Double backtick inline code
    Given the code zones input is "text ``code`` more"
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "inline"
    And code zone 1 starts at 5
    And code zone 1 ends at 13

  Scenario: Triple backtick inline code not at line start
    Given the code zones input is "text ```code``` more"
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "inline"
    And code zone 1 starts at 5
    And code zone 1 ends at 15

  Scenario: Unmatched backtick run produces no zone
    Given the code zones input is "text `unmatched backtick here"
    When I find code zones
    Then the code zones count is 0

  Scenario: Backtick run length must match exactly
    Given the code zones input is "text ``code``` more"
    When I find code zones
    # double-open cannot close with triple-close; no match found
    Then the code zones count is 0

  Scenario: Multiple inline code spans
    Given the code zones input is "`a` and `b` end"
    When I find code zones
    Then the code zones count is 2
    And code zone 1 has type "inline"
    And code zone 1 starts at 0
    And code zone 1 ends at 3
    And code zone 2 has type "inline"
    And code zone 2 starts at 8
    And code zone 2 ends at 11

  Scenario: Inline code inside fenced block is ignored
    Given the code zones input is:
      """
      ```
      `inline inside fence`
      ```
      """
    When I find code zones
    Then the code zones count is 1
    And code zone 1 has type "fence"

  Scenario: Mixed fenced and inline zones in order
    Given the code zones input is:
      """
      `inline` text
      ```
      fenced
      ```
      `more inline`
      """
    When I find code zones
    Then the code zones count is 3
    And code zone 1 has type "inline"
    And code zone 2 has type "fence"
    And code zone 3 has type "inline"

  # --- tryMatchFenceOpen ---

  Scenario: Returns marker info for valid backtick fence
    Given the code zones input is "```python\nnext line"
    When I try to match fence open at position 0
    Then the fence open marker code is 96
    And the fence open length is 3
    And the fence open nextPos is 10

  Scenario: Returns marker info for valid tilde fence
    Given the code zones input is "~~~\nnext line"
    When I try to match fence open at position 0
    Then the fence open marker code is 126
    And the fence open length is 3
    And the fence open nextPos is 4

  Scenario: Returns null for non-fence line
    Given the code zones input is "Hello world"
    When I try to match fence open at position 0
    Then the fence open result is null

  Scenario: Returns null for 4+ leading spaces
    Given the code zones input is "    ```\nnext"
    When I try to match fence open at position 0
    Then the fence open result is null

  Scenario: nextPos points to start of next line
    Given the code zones input is "````\nsecond line"
    When I try to match fence open at position 0
    Then the fence open marker code is 96
    And the fence open length is 4
    And the fence open nextPos is 5

  # --- tryMatchFenceClose ---

  Scenario: Matches closing fence with same marker
    Given the code zones input is "```\nnext"
    When I try to match fence close at position 0 with marker 96 and length 3
    Then the fence close result is 4

  Scenario: Returns -1 for different marker type
    Given the code zones input is "~~~\nnext"
    When I try to match fence close at position 0 with marker 96 and length 3
    Then the fence close result is -1

  Scenario: Returns -1 for shorter marker length
    Given the code zones input is "```\nnext"
    When I try to match fence close at position 0 with marker 96 and length 4
    Then the fence close result is -1

  Scenario: Allows longer closing marker
    Given the code zones input is "`````\nnext"
    When I try to match fence close at position 0 with marker 96 and length 3
    Then the fence close result is 6

  Scenario: Allows trailing whitespace after closing fence
    Given the code zones input is "```   \nnext"
    When I try to match fence close at position 0 with marker 96 and length 3
    Then the fence close result is 7

  # --- skipInlineCode ---

  Scenario: Skips matched inline code span
    Given the code zones input is "`code` rest"
    When I skip inline code at position 0
    Then the skip result is 6

  Scenario: Returns original position for unmatched backticks
    Given the code zones input is "`no close here"
    When I skip inline code at position 0
    Then the skip result is 0

  Scenario: Handles double-backtick spans
    Given the code zones input is "``code`` rest"
    When I skip inline code at position 0
    Then the skip result is 8

  Scenario: Content between backticks is irrelevant
    Given the code zones input is "`any {++content++} here` rest"
    When I skip inline code at position 0
    Then the skip result is 24

  Scenario: Backtick at end of text returns original position
    Given the code zones input is "text `"
    When I skip inline code at position 5
    Then the skip result is 5
