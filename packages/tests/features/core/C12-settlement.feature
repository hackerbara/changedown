Feature: C12 - Settlement (Settled Text Computation)
  Settlement produces clean text from CriticMarkup documents. The settled
  text represents the document as it would appear if all proposals were
  approved (accept-all semantics). Layer 1 settlement handles only accepted
  changes while preserving footnotes.

  # ===== computeSettledText (accept-all semantics) =====

  Scenario: Plain text without markup is unchanged
    When I compute settled text for "Hello world"
    Then the settled text is "Hello world"

  Scenario: Accepted insertion is absorbed
    When I compute settled text for:
      """
      Hello {++beautiful ++}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | insertion | accepted
      """
    Then the settled text is "Hello beautiful world"

  Scenario: Accepted deletion is absorbed
    When I compute settled text for:
      """
      Hello {--ugly --}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | deletion | accepted
      """
    Then the settled text is "Hello world"

  Scenario: Accepted substitution keeps new text
    When I compute settled text for:
      """
      Hello {~~old~>new~~}[^cn-1] world

      [^cn-1]: @alice | 2026-02-11 | sub | accepted
      """
    Then the settled text is "Hello new world"

  Scenario: Proposed insertion is kept in settled text (accept-all)
    When I compute settled text for:
      """
      Hello {++maybe ++}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | insertion | proposed
      """
    Then the settled text is "Hello maybe world"

  Scenario: Proposed deletion removes text (accept-all)
    When I compute settled text for:
      """
      Hello {--keep me--}[^cn-1] world

      [^cn-1]: @alice | 2026-02-11 | deletion | proposed
      """
    Then the settled text is "Hello  world"

  Scenario: Proposed substitution keeps new text (accept-all)
    When I compute settled text for:
      """
      Hello {~~old~>new~~}[^cn-1] world

      [^cn-1]: @alice | 2026-02-11 | sub | proposed
      """
    Then the settled text is "Hello new world"

  Scenario: Rejected insertion is still kept (accept-all)
    When I compute settled text for:
      """
      Hello {++bad ++}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | insertion | rejected
      """
    Then the settled text is "Hello bad world"

  Scenario: Rejected deletion still removes text (accept-all)
    When I compute settled text for:
      """
      Hello {--good --}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | deletion | rejected
      """
    Then the settled text is "Hello world"

  Scenario: Level 0 insertion (no footnote) is kept
    When I compute settled text for "Hello {++new ++}world"
    Then the settled text is "Hello new world"

  Scenario: Level 0 deletion (no footnote) removes text
    When I compute settled text for "Hello {--keep--} world"
    Then the settled text is "Hello  world"

  Scenario: Highlight reduces to plain text
    When I compute settled text for "Hello {==important==} world"
    Then the settled text is "Hello important world"

  Scenario: Comment is removed entirely
    When I compute settled text for "Hello {>>note<<} world"
    Then the settled text is "Hello  world"

  Scenario: Footnote definitions are stripped
    When I compute settled text for:
      """
      Hello world

      [^cn-1]: @alice | 2026-02-11 | insertion | accepted
          reason: testing
      """
    Then the settled text is "Hello world"

  Scenario: Multiple changes with mixed statuses (accept-all)
    When I compute settled text for:
      """
      Start {++accepted ++}[^cn-1]{++proposed ++}[^cn-2]{--rejected --}[^cn-3]end

      [^cn-1]: @a | 2026-02-11 | ins | accepted
      [^cn-2]: @a | 2026-02-11 | ins | proposed
      [^cn-3]: @a | 2026-02-11 | del | rejected
      """
    Then the settled text is "Start accepted proposed end"

  Scenario: Orphaned inline footnote refs are stripped
    When I compute settled text for "Some text[^cn-42] and more text"
    Then the settled text is "Some text and more text"

  Scenario: Highlight with attached comment
    When I compute settled text for "Check {==this text==}{>>important<<} carefully"
    Then the settled text is "Check this text carefully"

  Scenario: Empty document
    When I compute settled text for ""
    Then the settled text is ""

  Scenario: Whitespace-only text is preserved
    When I compute settled text for "  \n  \n  "
    Then the settled text is "  \n  \n  "

  # ===== settleAcceptedChangesOnly (Layer 1 settlement) =====

  Scenario: Layer 1 settles accepted insertion and preserves footnote
    When I settle accepted changes in:
      """
      Hello {++beautiful ++}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | insertion | accepted
      """
    Then the settled content contains "beautiful"
    And the settled content contains "[^cn-1]"
    And the settled content does not contain "{++"
    And the settled IDs include "cn-1"

  Scenario: Layer 1 does not touch proposed changes
    When I settle accepted changes in:
      """
      Hello {++maybe ++}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | insertion | proposed
      """
    Then the settled content contains "{++maybe ++}"
    And the settled IDs are empty

  Scenario: Layer 1 does not touch rejected changes
    When I settle accepted changes in:
      """
      Hello {++bad ++}[^cn-1]world

      [^cn-1]: @alice | 2026-02-11 | insertion | rejected
      """
    Then the settled content contains "{++bad ++}"
    And the settled IDs are empty

  # ===== Move groups =====

  Scenario: Move groups settle correctly with accept-all
    When I compute settled text for:
      """
      {--moved text--}[^cn-1.1] ... {++moved text++}[^cn-1.2]

      [^cn-1]: @a | 2026-02-11 | move | proposed
      [^cn-1.1]: @a | 2026-02-11 | del | proposed
      [^cn-1.2]: @a | 2026-02-11 | ins | proposed
      """
    Then the settled text is " ... moved text"
