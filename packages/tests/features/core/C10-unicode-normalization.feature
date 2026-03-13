Feature: C10 - Unicode Normalization
  The text normalizer provides NFKC normalization plus a thin confusables layer
  for matching user text. Smart quotes, NBSP, and en dashes are mapped to their
  ASCII equivalents. This enables reliable matching when LLMs produce visually
  similar but distinct Unicode characters.

  # --- defaultNormalizer ---

  Scenario: NFKC normalization of fullwidth characters
    When I normalize "\uFF28\uFF45\uFF4C\uFF4C\uFF4F"
    Then the normalized text is "Hello"

  Scenario: Smart single quotes to ASCII apostrophe
    When I normalize "\u2018hello\u2019"
    Then the normalized text is "'hello'"

  Scenario: Smart double quotes to ASCII double quote
    When I normalize "\u201Chello\u201D"
    Then the normalized text is '"hello"'

  Scenario: NBSP to regular space
    When I normalize "hello\u00A0world"
    Then the normalized text is "hello world"

  Scenario: En dash to hyphen-minus
    When I normalize "2020\u20132025"
    Then the normalized text is "2020-2025"

  Scenario: Plain ASCII text is unchanged
    When I normalize "hello world"
    Then the normalized text is "hello world"

  # --- normalizedIndexOf ---

  Scenario: Find text with smart quotes using normalized matching
    When I find "\u2018word\u2019" in "some 'word' here"
    Then the normalized index is 5

  Scenario: Find NBSP-separated text using normalized matching
    When I find "hello\u00A0world" in "say hello world now"
    Then the normalized index is 4

  Scenario: Not found returns -1
    When I find "missing" in "hello world"
    Then the normalized index is -1

  # --- collapseWhitespace ---

  Scenario: Whitespace runs collapse to single space
    When I collapse whitespace in "hello   world"
    Then the collapsed text is "hello world"

  Scenario: Tabs and newlines collapse to single space
    When I collapse whitespace in "hello\t\nworld"
    Then the collapsed text is "hello world"

  Scenario: Leading and trailing whitespace collapses
    When I collapse whitespace in "  hello  "
    Then the collapsed text is " hello "

  # --- whitespaceCollapsedFind ---

  Scenario: Find text across whitespace differences
    When I find "hello world" in "hello   world" with whitespace collapsing
    Then the whitespace-collapsed match index is 0
    And the whitespace-collapsed match length is 13

  Scenario: Find across newline boundaries
    When I find "hello world" in "hello\nworld" with whitespace collapsing
    Then the whitespace-collapsed match index is 0
    And the whitespace-collapsed match length is 11

  Scenario: No match returns null
    When I find "missing text" in "hello world" with whitespace collapsing
    Then the whitespace-collapsed match is null

  # --- whitespaceCollapsedIsAmbiguous ---

  Scenario: Single match is not ambiguous
    Then "hello" in "say hello friend" is not ambiguous under whitespace collapsing

  Scenario: Duplicate match is ambiguous
    Then "hello" in "hello and hello" is ambiguous under whitespace collapsing
