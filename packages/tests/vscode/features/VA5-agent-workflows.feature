@fast @agent-content @VA5
Feature: Human-Agent Collaboration Workflows
  End-to-end workflows for human-agent collaboration: humans review
  agent editorial passes, negotiate via discussion threads, create
  tracked changes agents can read, and resolve mixed accept/reject
  decisions across multiple agents.

  Background:
    Given reviewer identity is "human:reviewer"

  # ─── Human Reviews Agent Editorial Pass ──────────────────────────

  Scenario: Human reviews 5 agent changes - accept 3, reject 2
    Given a document with text:
      """
      # Design Document

      The API uses {~~REST~>GraphQL~~}[^ct-1] for queries.
      Auth: {~~API keys~>OAuth2~~}[^ct-2].
      {++Rate limiting added.++}[^ct-3]
      {--Legacy XML support removed.--}[^ct-4]
      {~~sync~>async~~}[^ct-5] processing.

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
          GraphQL gives query flexibility
      [^ct-2]: @ai:claude | 2026-02-10 | sub | proposed
          OAuth2 is more secure
      [^ct-3]: @ai:claude | 2026-02-10 | ins | proposed
          Rate limiting prevents abuse
      [^ct-4]: @ai:claude | 2026-02-10 | del | proposed
          XML is legacy, remove it
      [^ct-5]: @ai:claude | 2026-02-10 | sub | proposed
          Async improves throughput
      """
    # Accept ct-1 (REST → GraphQL): offset 35 is inside {~~REST...
    Given the cursor is at offset 35
    When I accept the change at the cursor with footnote update
    # Accept ct-2 (API keys → OAuth2): offset 69 is inside {~~API keys...
    Given the cursor is at offset 69
    When I accept the change at the cursor with footnote update
    # Accept ct-3 (Rate limiting insertion): offset 85 is inside {++Rate...
    Given the cursor is at offset 85
    When I accept the change at the cursor with footnote update
    # Reject ct-4 (Legacy XML deletion): offset 113 is inside {--Legacy...
    Given the cursor is at offset 113
    When I reject the change at the cursor with footnote update
    # Reject ct-5 (sync → async): offset 148 is inside {~~sync...
    Given the cursor is at offset 148
    When I reject the change at the cursor with footnote update
    Then the document text does not contain "{~~"
    And the document text does not contain "{++"
    And the document text does not contain "{--"
    And the document text does not contain "~~}"
    And the document text does not contain "++}"
    And the document text does not contain "--}"
    # Accepted changes: body reflects accepted decisions
    And the document text contains "GraphQL"
    And the document text contains "OAuth2"
    And the document text contains "Rate limiting added."
    # Rejected changes: body reflects rejected decisions
    And the document text contains "Legacy XML support removed."
    And the document text contains "sync"
    # Footnote statuses: 3 accepted, 2 rejected, 0 proposed
    And the document text does not contain "| proposed"
    And the document text matches "\| accepted" exactly 3 times
    And the document text matches "\| rejected" exactly 2 times
    # Discussion text preserved
    And the document text contains "GraphQL gives query flexibility"
    And the document text contains "OAuth2 is more secure"
    # Approval / rejection lines
    And 3 approval lines from "@human:reviewer" exist
    And 2 rejection lines from "@human:reviewer" exist

  # ─── Human Reviews Changes from Multiple Agents ──────────────────

  Scenario: Accept one agent change, reject another agent change
    Given a document with text:
      """
      {~~old1~>new1~~}[^ct-1] text. {~~old2~>new2~~}[^ct-2] more.

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
          Claude reasoning
      [^ct-2]: @ai:drafter | 2026-02-10 | sub | proposed
          Drafter reasoning
      """
    # Accept ct-1 (claude): cursor at offset 5 is inside {~~old1~>new1~~}
    And the cursor is at offset 5
    When I accept the change at the cursor with footnote update
    Then the document text contains "new1"
    And the document text does not contain "{~~old1"
    And the document text contains "{~~old2~>new2~~}"
    # Reject ct-2 (drafter): after accepting ct-1, text is "new1[^ct-1] text. {~~old2~>..."
    # {~~old2 starts at offset 18, cursor at 22 is inside "old2"
    Given the cursor is at offset 22
    When I reject the change at the cursor with footnote update
    Then the document line starting with "[^ct-1]:" contains "| accepted"
    And the document line starting with "[^ct-2]:" contains "| rejected"
    And the document line starting with "[^ct-1]:" contains "@ai:claude"
    And the document line starting with "[^ct-2]:" contains "@ai:drafter"
    And the document text contains "new1"
    And the document text contains "old2"
    And the document text does not contain "new2"
    And the document text contains "Claude reasoning"
    And the document text contains "Drafter reasoning"

  # ─── Document Clean After Full Review ────────────────────────────

  Scenario: Document is clean after Accept All
    Given a document with text:
      """
      Start. {++Insertion one.++}[^ct-1] Middle.
      {++Insertion two.++}[^ct-2]
      Keep {--removed text--}[^ct-3] keep.
      {~~old value~>new value~~}[^ct-4] end.

      [^ct-1]: @ai:claude | 2026-02-10 | ins | proposed
      [^ct-2]: @ai:claude | 2026-02-10 | ins | proposed
      [^ct-3]: @ai:claude | 2026-02-10 | del | proposed
      [^ct-4]: @ai:claude | 2026-02-10 | sub | proposed
      """
    When I accept all changes with footnote update
    Then the document text does not contain "{++"
    And the document text does not contain "++}"
    And the document text does not contain "{--"
    And the document text does not contain "--}"
    And the document text does not contain "{~~"
    And the document text does not contain "~~}"
    And the document text does not contain "~>"
    And the document text contains "Insertion one."
    And the document text contains "Insertion two."
    And the document text does not contain "removed text"
    And the document text contains "new value"
    And the document text does not contain "old value"
    And the document text does not contain "| proposed"
    And the document text matches "\| accepted" exactly 4 times
    And 4 approval lines from "@human:reviewer" exist

  # ─── Human-Created Markup is Agent-Readable ──────────────────────

  Scenario: Human-created markup is parseable by core parser
    Given the input text is:
      """
      Hello {++world++} end
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has modified text "world"
    And change 1 has level 0

  # ─── Human-Agent Negotiation Round-Trip ──────────────────────────

  Scenario: Human comment then agent responds then human accepts
    # Step 1: Start with agent-proposed change
    Given the input text is:
      """
      Config: {~~timeout = 30~>timeout = 60~~}[^ct-1]

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has status "proposed"
    And change 1 has author "@ai:claude"

    # Step 2: Human adds comment
    Given the input text is:
      """
      Config: {~~timeout = 30~>timeout = 60~~}[^ct-1]

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
          @human:alice 2026-02-11: Need benchmark data
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has 1 discussion entries
    And change 1 discussion entry 1 has author "@human:alice"

    # Step 3: Agent amends
    Given the input text is:
      """
      Config: {~~timeout = 30~>timeout = 45~~}[^ct-1]

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
          @human:alice 2026-02-11: Need benchmark data
            @ai:claude 2026-02-11: Benchmarks show 45s is optimal
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has modified text "timeout = 45"
    And change 1 has 2 discussion entries

    # Step 4: Human accepts the amended change
    Given a document with text:
      """
      Config: {~~timeout = 30~>timeout = 45~~}[^ct-1]

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
          @human:alice 2026-02-11: Need benchmark data
            @ai:claude 2026-02-11: Benchmarks show 45s is optimal
      """
    And the cursor is at offset 12
    When I accept the change at the cursor with footnote update
    Then the document text contains "timeout = 45"
    And the document text does not contain "{~~"
    And the document text does not contain "~~}"
    And the document contains footnote status "accepted"
    And the document text does not contain "| proposed"
    And the document text contains "@human:alice 2026-02-11: Need benchmark data"
    And the document text contains "@ai:claude 2026-02-11: Benchmarks show 45s is optimal"

  # ─── Mixed Accept/Reject with Pending ────────────────────────────

  Scenario: Accept some, reject some, leave one pending
    Given a document with text:
      """
      {~~alpha~>ALPHA~~}[^ct-1] and {++extra text++}[^ct-2] and {--removed--}[^ct-3] end.

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
      [^ct-2]: @ai:claude | 2026-02-10 | ins | proposed
      [^ct-3]: @ai:claude | 2026-02-10 | del | proposed
      """
    # Accept ct-1 (cursor inside substitution)
    And the cursor is at offset 5
    When I accept the change at the cursor with footnote update
    Then the document text contains "ALPHA"
    And the document text does not contain "{~~alpha"
    And the document line starting with "[^ct-1]:" contains "| accepted"
    # ct-2 and ct-3 should still have inline markup
    And the document text contains "{++extra text++}"
    And the document text contains "{--removed--}"
    And the document line starting with "[^ct-3]:" contains "| proposed"

  # ─── Full Human Editorial Pass with Re-Parse ────────────────────

  Scenario: Human reviews 5 changes then re-parses
    Given a document with text:
      """
      # Design Document

      The API uses {~~REST~>GraphQL~~}[^ct-1] for queries.
      Auth: {~~API keys~>OAuth2~~}[^ct-2].
      {++Rate limiting added.++}[^ct-3]
      {--Legacy XML support removed.--}[^ct-4]
      {~~sync~>async~~}[^ct-5] processing.

      [^ct-1]: @ai:claude | 2026-02-10 | sub | proposed
      [^ct-2]: @ai:claude | 2026-02-10 | sub | proposed
      [^ct-3]: @ai:claude | 2026-02-10 | ins | proposed
      [^ct-4]: @ai:claude | 2026-02-10 | del | proposed
      [^ct-5]: @ai:claude | 2026-02-10 | sub | proposed
      """
    When I accept all changes with footnote update
    Then the document text does not contain "{~~"
    And the document text does not contain "{++"
    And the document text does not contain "{--"
    And the document text contains "GraphQL"
    And the document text contains "OAuth2"
    And the document text contains "Rate limiting added."
    And the document text matches "\| accepted" exactly 5 times
    And the document text does not contain "| proposed"
    When I re-parse the document text
    Then 0 inline changes remain
