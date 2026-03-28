@fast @PNL5
Feature: PNL5 — Review panel lifecycle actions

  The review panel shows compact cards with hover-to-preview and
  click-to-navigate. All lifecycle actions available per card.

  Scenario: PNL5-01 Card shows change summary compactly
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
          @bob 2026-03-09: Looks good
          @carol 2026-03-09: Agreed
      """
    When I build the review panel state
    Then the card for cn-1 shows type "insertion"
    And the card for cn-1 shows status "proposed"
    And the card for cn-1 shows author "alice"
    And the card for cn-1 shows reply count 2

  Scenario: PNL5-02 Card without discussion shows zero replies
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """
    When I build the review panel state
    Then the card for cn-1 shows reply count 0

  Scenario: PNL5-02b Reply count rendered in panel HTML
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
          @bob 2026-03-09: Looks good
          @carol 2026-03-09: Agreed
      """
    When I build the review panel HTML
    Then the HTML contains "2"

  Scenario: PNL5-02c Zero replies omit reply badge from HTML
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """
    When I build the review panel HTML
    Then the HTML has no reply badge

  Scenario: PNL5-03 Panel uses theme CSS variables
    Given a lifecycle document with text:
      """
      Hello {++world++}[^cn-1]

      [^cn-1]: @alice | 2026-03-09 | insertion | proposed
      """
    When I build the review panel HTML
    Then the HTML contains "var(--vscode-"
    And the HTML does not contain "#ffeb3b"
