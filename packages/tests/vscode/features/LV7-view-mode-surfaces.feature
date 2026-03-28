@fast @LV7
Feature: LV7 — View mode surface visibility

  Gutter icons and overview ruler marks respect view mode.
  Simple and All Markup show lifecycle surfaces.
  Final and Original hide them for clean preview.

  Scenario: Simple mode shows gutter icons for L2 changes
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1] and {--removed--}[^cn-2] plus {~~old~>new~~}[^cn-3]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      [^cn-2]: @alice | 2026-03-09 | deletion | proposed
      [^cn-3]: @alice | 2026-03-09 | substitution | proposed
      """
    And view mode is "review"
    When I build comment threads
    Then 3 threads exist with gutter presence

  Scenario: All Markup mode shows threads
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1] and {--removed--}[^cn-2] plus {~~old~>new~~}[^cn-3]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      [^cn-2]: @alice | 2026-03-09 | deletion | proposed
      [^cn-3]: @alice | 2026-03-09 | substitution | proposed
      """
    And view mode is "changes"
    When I build comment threads
    Then 3 threads exist with gutter presence

  Scenario: Final mode hides all threads
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1] and {--removed--}[^cn-2] plus {~~old~>new~~}[^cn-3]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      [^cn-2]: @alice | 2026-03-09 | deletion | proposed
      [^cn-3]: @alice | 2026-03-09 | substitution | proposed
      """
    And view mode is "settled"
    When I build comment threads
    Then no threads are visible

  Scenario: Original mode hides all threads
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1] and {--removed--}[^cn-2] plus {~~old~>new~~}[^cn-3]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      [^cn-2]: @alice | 2026-03-09 | deletion | proposed
      [^cn-3]: @alice | 2026-03-09 | substitution | proposed
      """
    And view mode is "raw"
    When I build comment threads
    Then no threads are visible
