@fast @agent-content @VA4
Feature: Cross-Surface Coherence - Agent MCP and VS Code
  Files written by agents via MCP are correctly parsed by the VS Code
  extension, and files modified by humans in VS Code produce results
  that agents can read back. This verifies the shared parser contract
  across both surfaces.

  # ─── Agent Output -> VS Code Parsing ─────────────────────────────

  Scenario: Agent MCP output is parseable by VS Code parser
    Given the input text is:
      """
      The API uses {~~REST~>GraphQL~~}[^cn-1] for queries.

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
          GraphQL gives clients query flexibility
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a substitution
    And change 1 has id "cn-1"
    And change 1 has author "@ai:claude"
    And change 1 has status "proposed"
    And change 1 has original text "REST"
    And change 1 has modified text "GraphQL"

  Scenario: Agent batch output with dotted IDs parsed correctly
    Given the input text is:
      """
      {~~alpha~>ALPHA~~}[^cn-1.1] and {~~gamma~>GAMMA~~}[^cn-1.2]

      [^cn-1]: @ai:claude | 2026-02-10 | group | proposed
          Batch capitalize
      [^cn-1.1]: @ai:claude | 2026-02-10 | sub | proposed
          Cap first
      [^cn-1.2]: @ai:claude | 2026-02-10 | sub | proposed
          Cap third
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 has id "cn-1.1"
    And change 2 has id "cn-1.2"
    And change 1 id starts with "cn-1."
    And change 2 id starts with "cn-1."
    And change 1 is a substitution
    And change 2 is a substitution

  # ─── Human Accept -> Agent-Readable Result ───────────────────────

  Scenario: Human accept produces correct footnote state
    Given reviewer identity is "human:reviewer"
    And a document with text:
      """
      The API uses {~~REST~>GraphQL~~}[^cn-1] for queries.

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
          Better query flexibility
      """
    And the cursor is at offset 18
    When I accept the change at the cursor with footnote update
    Then the document text does not contain "{~~"
    And the document text does not contain "~~}"
    And the document text contains "GraphQL"
    And the document contains footnote status "accepted"
    And the document text does not contain "| proposed"
    And the document contains approval from "@human:reviewer"
    When I re-parse the document text
    Then 0 inline changes remain
    And 1 settled changes exist
    And the settled change has status "accepted"

  Scenario: Human reject restores original text with correct footnote
    Given reviewer identity is "human:reviewer"
    And a document with text:
      """
      Hello {++world++}[^cn-1] end

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    And the cursor is at offset 10
    When I reject the change at the cursor with footnote update
    Then the document text does not contain "{++"
    And the document text does not contain "++}"
    And the document contains footnote status "rejected"
    And the document text does not contain "| proposed"
    And the document contains rejection from "@human:reviewer"

  # ─── Human-Authored Changes -> Agent Compatibility ───────────────

  Scenario: Human-created CriticMarkup without footnotes is valid
    Given the input text is:
      """
      Hello {++world++} end
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has modified text "world"
    And change 1 has level 0
    And change 1 has no author
    And change 1 has no date

  Scenario: Human adds footnote manually and it parses correctly
    Given the input text is:
      """
      {~~old~>new~~}[^cn-1]

      [^cn-1]: @human:alice | 2026-02-10 | sub | proposed
          Manual edit reasoning
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has author "@human:alice"
    And change 1 has status "proposed"
    And change 1 has level 2

  # ─── Multi-Agent Document ────────────────────────────────────────

  Scenario: Document with changes from multiple agents and humans
    Given the input text is:
      """
      {~~REST~>GraphQL~~}[^cn-1] API.
      Auth: {~~keys~>OAuth2~~}[^cn-2].
      {++Rate limit: 1000/min++}[^cn-3]

      [^cn-1]: @ai:claude | 2026-02-10 | sub | proposed
      [^cn-2]: @human:alice | 2026-02-10 | sub | accepted
          approved: @human:bob 2026-02-10
      [^cn-3]: @ai:drafter | 2026-02-10 | ins | proposed
      """
    When I parse the text
    Then the parser finds 3 changes
    And change with id "cn-1" has author "@ai:claude"
    And change with id "cn-2" has author "@human:alice"
    And change with id "cn-3" has author "@ai:drafter"
    And change with id "cn-2" has status "accepted"
    And change with id "cn-1" has status "proposed"
    And change with id "cn-3" has status "proposed"

  # ─── Amendment Negotiation Round-Trip ────────────────────────────

  Scenario: Agent proposes, human reviews, agent amends, human accepts
    # Step 1: Parse proposed change
    Given the input text is:
      """
      Config: {~~timeout = 30~>timeout = 60~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has status "proposed"
    And change 1 has author "@ai:claude"

    # Step 2: Human adds review comment
    Given the input text is:
      """
      Config: {~~timeout = 30~>timeout = 60~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
          @human:reviewer 2026-02-11: Need benchmark data
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has 1 discussion entries
    And change 1 discussion entry 1 has author "@human:reviewer"

    # Step 3: Agent amends with revision
    Given the input text is:
      """
      Config: {~~timeout = 30~>timeout = 45~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
          @human:reviewer 2026-02-11: Need benchmark data
            @ai:claude 2026-02-11: Benchmarks show 45s is optimal
          revisions:
          r1 @ai:claude 2026-02-11: "timeout = 60"
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has modified text "timeout = 45"
    And change 1 has 2 discussion entries
    And change 1 has 1 revisions
    And change 1 revision 1 has text "timeout = 60"

    # Step 4: Human accepts the amended change
    Given reviewer identity is "human:reviewer"
    And a document with text:
      """
      Config: {~~timeout = 30~>timeout = 45~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10 | sub | proposed
          Increase for slow networks
          @human:reviewer 2026-02-11: Need benchmark data
            @ai:claude 2026-02-11: Benchmarks show 45s is optimal
          revisions:
          r1 @ai:claude 2026-02-11: "timeout = 60"
      """
    And the cursor is at offset 12
    When I accept the change at the cursor with footnote update
    Then the document text does not contain "{~~"
    And the document text does not contain "~~}"
    And the document text does not contain "~>"
    And the document text contains "timeout = 45"
    And the document contains footnote status "accepted"
    And the document text does not contain "| proposed"
    And the document contains approval from "@human:reviewer"
    And the document text contains "@human:reviewer 2026-02-11: Need benchmark data"
    And the document text contains "@ai:claude 2026-02-11: Benchmarks show 45s is optimal"
    And the document text contains "r1 @ai:claude"
    When I re-parse the document text
    Then 0 inline changes remain
