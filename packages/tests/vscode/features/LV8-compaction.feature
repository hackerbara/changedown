@fast @LV8
Feature: LV8 — Compaction in VS Code

  Users can compact resolved changes through level descent.
  Compaction is explicit, never automatic.

  Scenario: LV8-01 Compact L2 to L1 removes footnote, keeps inline metadata
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | accepted
          approved: @bob 2026-03-09 "Clear"
      """
    When I compact cn-1 to L1
    Then the compaction result does not contain "[^cn-1]:"
    And the compaction result contains "{++world++}"

  Scenario: LV8-02 Compact fully descends to L0 (bare markup, no metadata)
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | accepted
          approved: @bob 2026-03-09 "Clear"
      """
    When I compact cn-1 fully
    Then the compaction result contains "{++world++}"
    And the compaction result does not contain "[^cn-1]"

  Scenario: LV8-02b Compact rejected insertion fully descends to L0
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | rejected
          rejected: @bob 2026-03-09 "Not needed"
      """
    When I compact cn-1 fully
    Then the compaction result contains "{++world++}"
    And the compaction result does not contain "[^cn-1]"

  Scenario: LV8-02c Compact rejected deletion fully descends to L0
    Given a lifecycle document with text:
      """
      Hello {--world--}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | deletion | rejected
          rejected: @bob 2026-03-09 "Keep this"
      """
    When I compact cn-1 fully
    Then the compaction result contains "{--world--}"
    And the compaction result does not contain "[^cn-1]"

  Scenario: LV8-03 Cannot compact proposed change
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """
    When I try to compact cn-1
    Then compaction is blocked with "still proposed"

  Scenario: LV8-04 Warning on compacting unresolved thread
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | accepted
          @bob 2026-03-09: Still discussing this
      """
    When I try to compact cn-1
    Then a warning is shown about "unresolved discussion"

  Scenario: LV8-05 Compact accepted substitution fully applies modified text
    Given a lifecycle document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | accepted
          approved: @bob 2026-03-09 "Fixed"
      """
    When I compact cn-1 fully
    Then the compaction result contains "{~~wrold~>world~~}"
    And the compaction result does not contain "[^cn-1]"

  Scenario: LV8-06 Compact rejected substitution fully descends to L0
    Given a lifecycle document with text:
      """
      Hello {~~wrold~>world~~}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | substitution | rejected
          rejected: @bob 2026-03-09 "Keep original"
      """
    When I compact cn-1 fully
    Then the compaction result contains "{~~wrold~>world~~}"
    And the compaction result does not contain "[^cn-1]"

  Scenario: LV8-07 Compact accepted deletion removes footnote
    Given a lifecycle document with text:
      """
      Hello {--world--}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | deletion | accepted
          approved: @bob 2026-03-09 "Remove it"
      """
    When I compact cn-1 fully
    Then the compaction result contains "{--world--}"
    And the compaction result does not contain "[^cn-1]"

  Scenario: LV8-08 Multiple footnotes — compacting one preserves the others
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1] and {++earth++}[^cn-2]

      [^cn-1]: @alice | 2026-03-09 | insertion | accepted
          approved: @bob 2026-03-09 "Good"
      [^cn-2]: @alice | 2026-03-09 | insertion | proposed
          reason: Another change
      """
    When I compact cn-1 fully
    Then the compaction result does not contain "[^cn-1]"
    And the compaction result contains "[^cn-2]:"
