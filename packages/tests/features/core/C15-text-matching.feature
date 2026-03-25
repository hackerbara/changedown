@core @text-matching
Feature: Text matching
  The findUniqueMatch function locates text within a document using a
  multi-level cascade: exact match, NFKC-normalized match, NBSP match,
  whitespace-collapsed match, footnote-ref-skipping match, and settled-text
  match. Each level falls through to the next when the previous fails.

  Errors are raised when the target is not found at any level, or when it
  matches multiple locations (ambiguous).

  # ── Level 1: Exact match ──────────────────────────────────────────

  Scenario: Exact match found
    Given a document text "Hello world."
    When I search for "world"
    Then the match index is 6
    And the match length is 5
    And the match original text is "world"
    And the match was not normalized

  Scenario: Exact match not found without normalizer
    Given a document text "Hello world."
    When I search for "xyz" without normalizer
    Then the search throws a not-found error

  Scenario: Exact match is ambiguous without normalizer
    Given a document text "the cat and the dog"
    When I search for "the" without normalizer
    Then the search throws an ambiguous error

  # ── Level 2: NFKC-normalized match ───────────────────────────────

  Scenario: Smart quote does not match ASCII apostrophe (ADR-061)
    Given a document text with smart right single quote "Sublime's architecture is elegant."
    When I search for "Sublime's" with normalizer
    Then the search throws a not-found error

  # ── Level 3: NBSP matching ───────────────────────────────────────

  Scenario: NBSP normalized to regular space
    Given a document text with NBSP between "hello" and "world"
    When I search for "hello world" with normalizer
    Then the match index is 0
    And the match length is 11
    And the match was normalized

  # ── Level 4: Whitespace-collapsed matching ───────────────────────

  Scenario: Matches when LLM omits trailing space before newline
    Given a document text with trailing-space newline "ground truth; " and "projections derive current state."
    When I search for collapsed "truth;\nprojections derive current state."
    Then the match index is 7
    And the match was normalized

  Scenario: Matches when LLM collapses multiple spaces to one
    Given a document text "hello    world  here"
    When I search for "hello world here" with normalizer
    Then the match index is 0
    And the match length is 20
    And the match was normalized

  Scenario: Whitespace-collapsed match is ambiguous
    Given a document text with double-space and newline-joined "hello world"
    When I search for "hello world" with normalizer
    Then the search throws an ambiguous error

  # ── Level 5: Footnote-ref-skipping match ──────────────────────────

  Scenario: Matches text transparently skipping footnote refs
    Given a document text "The {++quick++}[^ct-1] brown fox."
    When I search for "The {++quick++} brown"
    Then the match was normalized
    And the match original text contains "[^ct-1]"

  # ── Level 6: Settled-text matching ────────────────────────────────

  Scenario: Matches via settled text for inserted content
    Given a document text "Hello {++beautiful ++}world."
    When I search for "Hello beautiful world." with normalizer
    Then the match was a settled match
    And the match was normalized

  Scenario: Matches via settled text for substituted content
    Given a document text "Hello {~~old~>new~~} world."
    When I search for "Hello new world." with normalizer
    Then the match was a settled match

  # ── Not found at any level ────────────────────────────────────────

  Scenario: All levels fail throws not-found
    Given a document text "Hello world."
    When I search for "completely missing" with normalizer
    Then the search throws a not-found error

  Scenario: Smart quote mismatch is not found (ADR-061)
    Given a document text with two smart-quoted "Sublime's"
    When I search for "Sublime's" with normalizer
    Then the search throws a not-found error

  # ── Overlap detection ─────────────────────────────────────────────

  Scenario: Non-overlapping range returns no conflict
    Given a document text "Before {++inserted++} after."
    When I check overlap at index 0 length 6
    Then there is no overlap

  Scenario: Overlap detected with insertion
    Given a document text "Before {++inserted++} after."
    When I check overlap at index 10 length 4
    Then the overlap change type is "ins"

  Scenario: Overlap detected with substitution
    Given a document text "Before {~~old~>new~~} after."
    When I check overlap at index 10 length 3
    Then the overlap change type is "sub"

  Scenario: Overlap detected with deletion
    Given a document text "Before {--deleted--} after."
    When I check overlap at index 10 length 3
    Then the overlap change type is "del"

  Scenario: Overlap skips settled footnote ref (accepted status)
    Given a document text:
      """
      The quick brown fox[^ct-1] jumps over.

      [^ct-1]: @ai:test | 2026-02-20 | sub | accepted
      """
    When I check overlap at the position of "quick brown fox"
    Then there is no overlap

  Scenario: Overlap still blocks proposed inline CriticMarkup
    Given a document text:
      """
      Before {++inserted text++}[^ct-1] after.

      [^ct-1]: @ai:test | 2026-02-20 | ins | proposed
      """
    When I check overlap at the position of "inserted text"
    Then the overlap change type is "ins"

  Scenario: Overlap allows accepted inline CriticMarkup (pre-compaction)
    Given a document text:
      """
      Before {++added++}[^ct-1] after.

      [^ct-1]: @ai:test | 2026-02-20 | ins | accepted
      """
    When I check overlap at the position of "added"
    Then there is no overlap

  Scenario: Overlap blocks Level 0 markup (no footnote defaults to proposed)
    Given a document text "Before {++inserted text++} after."
    When I check overlap at the position of "inserted text"
    Then the overlap change type is "ins"

  Scenario: guardOverlap does not throw for safe range
    Given a document text "Before {++inserted++} after."
    When I guard overlap at index 0 length 6
    Then no error is thrown

  Scenario: guardOverlap throws for overlapping range
    Given a document text "Before {++inserted++} after."
    When I guard overlap at index 10 length 4
    Then the guard throws an overlap error
