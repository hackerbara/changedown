@fast @LV3
Feature: LV3 — Reply to thread

  Replying to a ct-ID thread appends a discussion line to the footnote.
  Replying to an L1 change promotes it to L2.

  Scenario: Reply appends to existing footnote
    Given a reply document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added for clarity
      """
    When I reply to ct-1 with "Looks good, minor typo on line 3"
    Then the reply result footnote for ct-1 contains "@bob 2026-03-09"
    And the reply result footnote for ct-1 contains "Looks good, minor typo on line 3"

  Scenario: Reply to L1 change promotes to L2
    Given a reply document with text:
      """
      Hello {++world++}{>>@alice | 2026-03-09<<}
      """
    When I reply to the L1 change with "Consider rewording"
    Then the reply result contains a footnote reference
    And the reply result contains a footnote block
    And the reply result footnote contains "@bob"
    And the reply result footnote contains "Consider rewording"

  Scenario: LV3-03 Multi-reply chain (3 replies by different authors)
    Given a reply document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added for clarity
      """
    When I reply to ct-1 with "First comment"
    And I reply again to ct-1 with "Second comment" as "@carol"
    And I reply again to ct-1 with "Third comment" as "@dave"
    Then the reply result footnote for ct-1 contains "First comment"
    And the reply result footnote for ct-1 contains "Second comment"
    And the reply result footnote for ct-1 contains "Third comment"

  Scenario: LV3-04 Reply to already-accepted change (post-decision discussion)
    Given a reply document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | accepted
          approved: @bob 2026-03-09 "Clear"
      """
    When I reply to ct-1 with "Post-acceptance note: verify edge case"
    Then the reply result footnote for ct-1 contains "Post-acceptance note: verify edge case"

  Scenario: LV3-05 Reply with multi-line text
    Given a reply document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added for clarity
      """
    When I reply to ct-1 with "Line one of the reply\nLine two continues here"
    Then the reply result footnote for ct-1 contains "Line one of the reply"
    And the reply result footnote for ct-1 contains "Line two continues here"

  Scenario: LV3-06 Reply to L0 change promotes to L2 with footnote
    Given a reply document with text:
      """
      Hello {++world++} today.
      """
    When I reply to the L0 change at offset 6 with "Why this word?"
    Then the reply result contains a footnote reference
    And the reply result contains a footnote block
    And the reply result footnote contains "Why this word?"
