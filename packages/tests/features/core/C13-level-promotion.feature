@core @level-promotion
Feature: Level promotion and descent
  CriticMarkup changes exist at three metadata levels:
    Level 0: bare markup ({++text++})
    Level 1: markup + adjacent comment ({++text++}{>>@author|proposed<<})
    Level 2: markup + footnote ref + footnote definition ({++text++}[^cn-1] ... [^cn-1]: ...)

  Promotion adds metadata; descent (compaction) removes it.

  # ── Level 0 → Level 1: add adjacent comment ──────────────────────

  Scenario: Promote substitution from Level 0 to Level 1
    Given a CriticMarkup text "{~~REST~>GraphQL~~}"
    When I promote change 0 to Level 1 with metadata "@alice|proposed"
    Then the result is "{~~REST~>GraphQL~~}{>>@alice|proposed<<}"

  Scenario: Promote insertion from Level 0 to Level 1
    Given a CriticMarkup text "{++new text++}"
    When I promote change 0 to Level 1 with metadata "@bob|proposed"
    Then the result is "{++new text++}{>>@bob|proposed<<}"

  Scenario: Promote deletion from Level 0 to Level 1
    Given a CriticMarkup text "{--removed--}"
    When I promote change 0 to Level 1 with metadata "@carol|proposed"
    Then the result is "{--removed--}{>>@carol|proposed<<}"

  # ── Level 1 → Level 2: add footnote ──────────────────────────────

  Scenario: Promote substitution from Level 1 to Level 2
    Given a CriticMarkup text "{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}"
    When I promote change 0 to Level 2 with id "cn-1"
    Then the result contains "{~~REST~>GraphQL~~}[^cn-1]"
    And the result contains "[^cn-1]: @alice | 2026-02-13 | sub | proposed"

  # ── Level 2 → Level 1: compact footnote to adjacent comment ──────

  Scenario: Compact substitution from Level 2 to Level 1
    Given a CriticMarkup text:
      """
      {~~REST~>GraphQL~~}[^cn-1]

      [^cn-1]: @alice | 2026-02-13 | sub | accepted
          approved: @carol 2026-02-15
      """
    When I compact change "cn-1" to Level 1
    Then the result is "{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|accepted<<}"

  # ── Level 1 → Level 0: strip adjacent comment ────────────────────

  Scenario: Compact substitution from Level 1 to Level 0
    Given a CriticMarkup text "{~~REST~>GraphQL~~}{>>@alice|accepted<<}"
    When I compact change 0 to Level 0
    Then the result is "{~~REST~>GraphQL~~}"

  # ── Edge cases ────────────────────────────────────────────────────

  Scenario: Promote out-of-range index returns text unchanged
    Given a CriticMarkup text "{++text++}"
    When I promote change 5 to Level 1 with metadata "@alice|proposed"
    Then the result is "{++text++}"

  Scenario: Compact out-of-range index returns text unchanged
    Given a CriticMarkup text "{++text++}{>>@alice|proposed<<}"
    When I compact change 5 to Level 0
    Then the result is "{++text++}{>>@alice|proposed<<}"

  # ── Level 1 adjacent comment parsing ────────────────────────────────

  Scenario: Level 1 with pipe-separated fields in adjacent comment
    Given the markup text "{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}"
    When I parse the markup
    Then there is 1 change
    And change 1 has level 1
    And change 1 has inline author "@alice"
    And change 1 has inline date "2026-02-13"
    And change 1 has inline type "sub"
    And change 1 has inline status "proposed"

  Scenario: Level 1 with author and status only
    Given the markup text "{++new text++}{>>@bob|approved<<}"
    When I parse the markup
    Then there is 1 change
    And change 1 has level 1
    And change 1 has inline author "@bob"
    And change 1 has inline status "approved"

  Scenario: Free-text reason in Level 1 comment
    Given the markup text "{++rate limiting++}{>>performance concern<<}"
    When I parse the markup
    Then there is 1 change
    And change 1 has level 1
    And change 1 has inline free text "performance concern"

  Scenario: Level 0 classification — no adjacent comment, no footnote
    Given the markup text "{~~REST~>GraphQL~~}"
    When I parse the markup
    Then there is 1 change
    And change 1 has level 0
    And change 1 has no inline metadata

  Scenario: Level 2 classification — has footnote ref
    Given the markup text with footnotes:
      """
      {~~REST~>GraphQL~~}[^cn-1]

      [^cn-1]: @alice | 2026-02-13 | sub | proposed
      """
    When I parse the markup
    Then there is 1 change
    And change 1 has level 2

  Scenario: Level 1 with whitespace around pipes
    Given the markup text "{~~old~>new~~}{>>@alice | approved<<}"
    When I parse the markup
    Then there is 1 change
    And change 1 has inline author "@alice"
    And change 1 has inline status "approved"

  Scenario: Level 1 with empty fields between pipes
    Given the markup text "{~~old~>new~~}{>>@alice||2026-02-13<<}"
    When I parse the markup
    Then there is 1 change
    And change 1 has inline author "@alice"
    And change 1 has inline date "2026-02-13"

  Scenario: Level 1 with all fields populated
    Given the markup text "{~~REST~>GraphQL~~}{>>@alice|2026-02-13|sub|proposed<<}"
    When I parse the markup
    Then there is 1 change
    And change 1 has level 1
    And change 1 has inline author "@alice"
    And change 1 has inline date "2026-02-13"
    And change 1 has inline type "sub"
    And change 1 has inline status "proposed"
