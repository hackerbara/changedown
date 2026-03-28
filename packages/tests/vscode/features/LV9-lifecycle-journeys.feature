@fast @LV9
Feature: LV9 — Lifecycle journey tests

  Journey tests chain multiple lifecycle operations in-process.
  Each step applies a core operation to the document text and
  passes the result to the next step.

  Scenario: LV9-A Golden path — propose, reply, accept with reason, resolve, compact
    Given a journey document with text:
      """
      The system uses {~~60 seconds~>OAuth2~~}[^cn-1] for all endpoints.

      [^cn-1]: @alice | 2026-03-09 | sub | proposed
          @alice 2026-03-09T10:00:00Z: Modern auth standard
      """
    When @bob replies to cn-1 with "OAuth2 is good but specify the grant type"
    Then the journey footnote for cn-1 contains "@bob"
    When @bob accepts cn-1 with reason "Looks good"
    Then the journey footnote for cn-1 has status "accepted"
    When @bob resolves cn-1
    Then the journey footnote for cn-1 contains "resolved:"
    When I compact cn-1 fully in the journey
    Then the journey document text contains "OAuth2"
    And the journey document text does not contain "[^cn-1]"

  Scenario: LV9-B Request-changes then amend cycle
    Given a journey document with text:
      """
      The timeout is {~~30 seconds~>60 seconds~~}[^cn-1].

      [^cn-1]: @alice | 2026-03-09 | sub | proposed
          @alice 2026-03-09T10:00:00Z: Too short for slow networks
      """
    When @bob requests changes on cn-1 with "Consider making it configurable instead of hardcoding"
    Then the journey footnote for cn-1 contains "request-changes:"
    And the journey footnote for cn-1 has status "proposed"
    When @alice amends cn-1 to "a configurable timeout (default: 60s)" with reason "Made configurable per reviewer feedback"
    Then the journey document text contains "configurable timeout"
    And the journey footnote for cn-1 contains "revised"
    When @bob accepts cn-1 with reason "Good compromise"
    Then the journey footnote for cn-1 has status "accepted"

  Scenario: LV9-C Supersede flow
    Given a journey document with text:
      """
      Log all errors to {~~a file~>a log file~~}[^cn-1].

      [^cn-1]: @alice | 2026-03-09 | sub | proposed
          @alice 2026-03-09T10:00:00Z: Persistent logging
      """
    When @bob supersedes cn-1 with "structured logging service" and reason "Log files are 2005, use structured logging"
    Then the journey footnote for cn-1 has status "rejected"
    And the journey footnote for cn-1 contains "superseded-by:"
    And the journey document contains 2 changes
    And the journey footnote for cn-2 contains "supersedes:"

  Scenario: LV9-D L0 auto-promotion via ensureL2
    Given a journey document with text:
      """
      Hello {++world++} today.
      """
    When @bob replies to the L0 change with "Should this be capitalized?"
    Then the journey document contains a footnote reference
    And the journey document contains a footnote block for cn-1
    And the journey footnote for cn-1 contains "@bob"
    And the journey footnote for cn-1 contains "Should this be capitalized?"

  Scenario: LV9-E Multi-change document
    Given a journey document with text:
      """
      Line one is {++inserted++}[^cn-1].
      Line two has {~~a bug~>a fix~~}[^cn-2].
      Line three is {++also new++}[^cn-3].
      Line four is {--removed--}[^cn-4].
      Line five has {==a highlight==}[^cn-5].

      [^cn-1]: @alice | 2026-03-09 | ins | proposed
          @alice 2026-03-09T10:00:00Z: First
      [^cn-2]: @bob | 2026-03-09 | sub | proposed
          @bob 2026-03-09T10:01:00Z: Second
      [^cn-3]: @alice | 2026-03-09 | ins | proposed
          @alice 2026-03-09T10:02:00Z: Third
      [^cn-4]: @carol | 2026-03-09 | del | proposed
          @carol 2026-03-09T10:03:00Z: Fourth
      [^cn-5]: @alice | 2026-03-09 | hig | proposed
          @alice 2026-03-09T10:04:00Z: Fifth
      """
    When @bob accepts cn-1 with reason "Good"
    And @bob rejects cn-4 with reason "Keep it"
    And @carol replies to cn-5 with "Checked, it's fine"
    Then the journey document has 3 changes with status "proposed"
    And the journey document has 1 change with status "accepted"
    And the journey document has 1 change with status "rejected"

  Scenario: LV9-F Cross-author enforcement
    Given a journey document with text:
      """
      The API returns {~~XML~>JSON~~}[^cn-1] responses.

      [^cn-1]: @alice | 2026-03-09 | sub | proposed
          @alice 2026-03-09T10:00:00Z: Modern format
      """
    When @bob tries to amend cn-1 to "YAML"
    Then the journey amend is rejected with "not the original author"
    When @bob supersedes cn-1 with "Protocol Buffers" and reason "Even more modern"
    Then the journey footnote for cn-1 has status "rejected"
    And a new cn-2 change exists in the journey document
