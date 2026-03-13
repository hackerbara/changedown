@fast @CL3
Feature: CL3 — CodeLens lifecycle state indicators

  CodeLens shows deliberation state alongside Accept/Reject.

  Scenario: CL3-01 Change with discussion shows comment count
    Given a lifecycle document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          @bob 2026-03-09: Looks good
          @carol 2026-03-09: Agreed
          @alice 2026-03-09: Thanks
      """
    When I compute CodeLens indicators
    Then the indicator for ct-1 contains "💬 3"

  Scenario: CL3-02 Change with request-changes shows warning
    Given a lifecycle document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added greeting
          request-changes: @bob 2026-03-09 "Needs rewording"
      """
    When I compute CodeLens indicators
    Then the indicator for ct-1 contains "⚠"

  Scenario: CL3-03 Change with amendment shows edit indicator
    Given a lifecycle document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          revisions:
          r1 @alice 2026-03-09: "Fixed typo"
      """
    When I compute CodeLens indicators
    Then the indicator for ct-1 contains "✎"

  Scenario: CL3-04 Resolved thread clears discussion indicator
    Given a lifecycle document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
          reason: Added greeting
          @bob 2026-03-09: Looks good
          resolved: @carol 2026-03-09
      """
    When I compute CodeLens indicators
    Then the indicator for ct-1 does not contain "💬"

  Scenario: CL3-05 Change without discussion has no comment indicator
    Given a lifecycle document with text:
      """
      Hello {++world++}[^ct-1]

      [^ct-1]: @alice | 2026-03-09 | insertion | proposed
      """
    When I compute CodeLens indicators
    Then the indicator for ct-1 does not contain "💬"
