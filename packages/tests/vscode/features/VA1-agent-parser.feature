@fast @agent-content @VA1
Feature: Agent Content Parser - Footnote and Metadata Handling
  The core parser handles CriticMarkup created by AI agents via MCP,
  including footnote references [^cn-N], footnote definitions with
  metadata, discussion threads, and move operations with dotted IDs.

  # ─── Footnote Reference Parsing ──────────────────────────────────

  Scenario: Insertion with footnote reference
    Given the input text is:
      """
      Hello {++world++}[^cn-1] end
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is an insertion
    And change 1 has id "cn-1"
    And change 1 has modified text "world"
    And change 1 has level 2

  Scenario: Substitution with footnote reference
    Given the input text is:
      """
      {~~REST~>GraphQL~~}[^cn-2]
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a substitution
    And change 1 has id "cn-2"
    And change 1 has original text "REST"
    And change 1 has modified text "GraphQL"

  Scenario: Deletion with footnote reference
    Given the input text is:
      """
      {--removed text--}[^cn-3]
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a deletion
    And change 1 has id "cn-3"
    And change 1 has original text "removed text"

  Scenario: Highlight with footnote reference
    Given the input text is:
      """
      {==important==}[^cn-4]
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a highlight
    And change 1 has id "cn-4"
    And change 1 has original text "important"

  Scenario: Footnote reference extends the change range
    Given the input text is:
      """
      Hello {++world++}[^cn-1] end
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 range starts at 6
    And change 1 range ends at 24

  Scenario: Change without footnote retains auto-generated id
    Given the input text is:
      """
      {++no footnote++}
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 id starts with "cn-"
    And change 1 has level 0

  # ─── Dotted IDs for Grouped Changes ──────────────────────────────

  Scenario: Batch changes with dotted IDs
    Given the input text is:
      """
      {~~alpha~>ALPHA~~}[^cn-1.1] and {~~beta~>BETA~~}[^cn-1.2]
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 has id "cn-1.1"
    And change 2 has id "cn-1.2"

  Scenario: Dotted IDs share a common group prefix
    Given the input text is:
      """
      {++first++}[^cn-3.1] {++second++}[^cn-3.2] {++third++}[^cn-3.3]
      """
    When I parse the text
    Then the parser finds 3 changes
    And all changes share group prefix "cn-3."

  Scenario: Mixed dotted and non-dotted IDs
    Given the input text is:
      """
      {++standalone++}[^cn-1] then {~~a~>b~~}[^cn-2.1] and {~~c~>d~~}[^cn-2.2]
      """
    When I parse the text
    Then the parser finds 3 changes
    And change 1 has id "cn-1"
    And change 2 has id "cn-2.1"
    And change 3 has id "cn-2.2"

  # ─── Footnote Definition Metadata ────────────────────────────────

  Scenario: Footnote definition attaches author
    Given the input text is:
      """
      Hello {++world++}[^cn-1] end

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
          Performance improvement
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has id "cn-1"
    And change 1 has author "@ai:claude"

  Scenario: Footnote definition attaches date
    Given the input text is:
      """
      {++added++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has date "2026-02-10T09:00:00Z"

  Scenario: Change type comes from inline markup not footnote
    Given the input text is:
      """
      {++inserted++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 is an insertion

  Scenario: Proposed status stays Proposed
    Given the input text is:
      """
      {++added++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has status "proposed"

  Scenario: Level 2 when footnote definition is found
    Given the input text is:
      """
      {++added++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has level 2

  # ─── Accepted Change Metadata ────────────────────────────────────

  Scenario: Accepted footnote status sets ChangeStatus.Accepted
    Given the input text is:
      """
      {~~old~>new~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | accepted
          Reasoning here
          approved: @human:alice 2026-02-10
      """
    When I parse the text
    Then change 1 has status "accepted"

  Scenario: Accepted footnote attaches approval metadata
    Given the input text is:
      """
      {~~old~>new~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | accepted
          Reasoning here
          approved: @human:alice 2026-02-10
      """
    When I parse the text
    Then change 1 has 1 approvals
    And change 1 approval 1 has author "@human:alice"
    And change 1 approval 1 has date "2026-02-10"

  Scenario: Rejected footnote status sets ChangeStatus.Rejected
    Given the input text is:
      """
      {++bad idea++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | rejected
          rejected: @human:bob 2026-02-11
      """
    When I parse the text
    Then change 1 has status "rejected"

  # ─── Discussion Thread Parsing ───────────────────────────────────

  Scenario: Footnote with discussion thread entries
    Given the input text is:
      """
      {++text++}[^cn-1]

      [^cn-1]: @ai:drafter | 2026-02-10T09:00:00Z | ins | proposed
          Added for clarity
          @ai:reviewer 2026-02-10T10:00:00Z: Needs more context
            @ai:drafter 2026-02-10T11:00:00Z: Added examples below
          @human:alice 2026-02-10T12:00:00Z: Looks good now
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has 3 discussion entries

  Scenario: Discussion entries have correct authors
    Given the input text is:
      """
      {++text++}[^cn-1]

      [^cn-1]: @ai:drafter | 2026-02-10T09:00:00Z | ins | proposed
          Added for clarity
          @ai:reviewer 2026-02-10T10:00:00Z: Needs more context
            @ai:drafter 2026-02-10T11:00:00Z: Added examples below
          @human:alice 2026-02-10T12:00:00Z: Looks good now
      """
    When I parse the text
    Then change 1 discussion includes author "@ai:reviewer"
    And change 1 discussion includes author "@ai:drafter"
    And change 1 discussion includes author "@human:alice"

  Scenario: Discussion entries have correct depth (nesting)
    Given the input text is:
      """
      {++text++}[^cn-1]

      [^cn-1]: @ai:drafter | 2026-02-10T09:00:00Z | ins | proposed
          Added for clarity
          @ai:reviewer 2026-02-10T10:00:00Z: Needs more context
            @ai:drafter 2026-02-10T11:00:00Z: Added examples below
          @human:alice 2026-02-10T12:00:00Z: Looks good now
      """
    When I parse the text
    Then change 1 discussion entry 1 has depth 0
    And change 1 discussion entry 2 has depth 1
    And change 1 discussion entry 3 has depth 0

  # ─── Multiple Agent Changes with Footnotes ───────────────────────

  Scenario: Three agent changes with separate footnotes
    Given the input text is:
      """
      # Document

      The API uses {~~REST~>GraphQL~~}[^cn-1] for queries.
      Authentication uses {~~API keys~>OAuth2~~}[^cn-2].
      {++Rate limiting is 1000 req/min.++}[^cn-3]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
      [^cn-2]: @ai:claude | 2026-02-10T09:01:00Z | sub | accepted
      [^cn-3]: @ai:claude | 2026-02-10T09:02:00Z | ins | proposed
      """
    When I parse the text
    Then the parser finds 3 changes

  Scenario: Correct change types in multi-change document
    Given the input text is:
      """
      # Document

      The API uses {~~REST~>GraphQL~~}[^cn-1] for queries.
      Authentication uses {~~API keys~>OAuth2~~}[^cn-2].
      {++Rate limiting is 1000 req/min.++}[^cn-3]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
      [^cn-2]: @ai:claude | 2026-02-10T09:01:00Z | sub | accepted
      [^cn-3]: @ai:claude | 2026-02-10T09:02:00Z | ins | proposed
      """
    When I parse the text
    Then there are 2 substitutions
    And there are 1 insertions

  Scenario: Each change gets correct status from its footnote
    Given the input text is:
      """
      # Document

      The API uses {~~REST~>GraphQL~~}[^cn-1] for queries.
      Authentication uses {~~API keys~>OAuth2~~}[^cn-2].
      {++Rate limiting is 1000 req/min.++}[^cn-3]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
      [^cn-2]: @ai:claude | 2026-02-10T09:01:00Z | sub | accepted
      [^cn-3]: @ai:claude | 2026-02-10T09:02:00Z | ins | proposed
      """
    When I parse the text
    Then change with id "cn-1" has status "proposed"
    And change with id "cn-2" has status "accepted"
    And change with id "cn-3" has status "proposed"

  Scenario: All changes get the same author from footnotes
    Given the input text is:
      """
      {++first++}[^cn-1]
      {++second++}[^cn-2]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      [^cn-2]: @ai:claude | 2026-02-10T09:01:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has author "@ai:claude"
    And change 2 has author "@ai:claude"

  # ─── Move Operations with Dotted IDs ─────────────────────────────

  Scenario: Move operation deletion and insertion pair
    Given the input text is:
      """
      {--moved text--}[^cn-5.1]

      New location: {++moved text++}[^cn-5.2]

      [^cn-5]: @ai:claude | 2026-02-10T09:00:00Z | move | proposed
      [^cn-5.1]: @ai:claude | 2026-02-10T09:00:00Z | del | proposed
      [^cn-5.2]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then the parser finds 2 changes
    And change 1 is a deletion
    And change 2 is an insertion

  Scenario: Move group assigns groupId to both parts
    Given the input text is:
      """
      {--moved text--}[^cn-5.1]

      New location: {++moved text++}[^cn-5.2]

      [^cn-5]: @ai:claude | 2026-02-10T09:00:00Z | move | proposed
      [^cn-5.1]: @ai:claude | 2026-02-10T09:00:00Z | del | proposed
      [^cn-5.2]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has groupId "cn-5"
    And change 2 has groupId "cn-5"

  Scenario: Move group assigns correct moveRole
    Given the input text is:
      """
      {--moved text--}[^cn-5.1]

      New location: {++moved text++}[^cn-5.2]

      [^cn-5]: @ai:claude | 2026-02-10T09:00:00Z | move | proposed
      [^cn-5.1]: @ai:claude | 2026-02-10T09:00:00Z | del | proposed
      [^cn-5.2]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has moveRole "from"
    And change 2 has moveRole "to"

  # ─── Agent Content Edge Cases ────────────────────────────────────

  Scenario: Orphan footnote ref with no matching definition
    Given the input text is:
      """
      {++orphan++}[^cn-99]
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has id "cn-99"
    And change 1 has level 2
    And change 1 has no author

  Scenario: Footnote definition without matching inline change is ignored
    Given the input text is:
      """
      {++present++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      [^cn-99]: @ai:ghost | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 has id "cn-1"

  Scenario: Multiple footnote definitions for consecutive changes
    Given the input text is:
      """
      {++a++}[^cn-1] {--b--}[^cn-2] {~~c~>d~~}[^cn-3]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | proposed
      [^cn-2]: @ai:claude | 2026-02-10T09:01:00Z | del | accepted
      [^cn-3]: @human:alice | 2026-02-10T09:02:00Z | sub | rejected
      """
    When I parse the text
    Then the parser finds 3 changes
    And change 1 has author "@ai:claude"
    And change 1 has status "proposed"
    And change 2 has author "@ai:claude"
    And change 2 has status "accepted"
    And change 3 has author "@human:alice"
    And change 3 has status "rejected"

  Scenario: Footnote with context field
    Given the input text is:
      """
      {~~old~>new~~}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
          context: "The API uses {old} for queries"
      """
    When I parse the text
    Then change 1 has context "The API uses {old} for queries"

  Scenario: Footnote with resolution
    Given the input text is:
      """
      {++added++}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | ins | accepted
          resolved @human:alice 2026-02-11: Confirmed correct
      """
    When I parse the text
    Then change 1 has resolution type "resolved"
    And change 1 has resolution author "@human:alice"
    And change 1 has resolution reason "Confirmed correct"

  Scenario: Highlight with comment AND footnote reference
    Given the input text is:
      """
      {==important==}{>>review this<<}[^cn-1]

      [^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | highlight | proposed
      """
    When I parse the text
    Then the parser finds 1 change
    And change 1 is a highlight
    And change 1 has comment "review this"

  Scenario: AI namespace author format is preserved
    Given the input text is:
      """
      {++added++}[^cn-1]

      [^cn-1]: @ai:claude-opus-4.6 | 2026-02-10T09:00:00Z | ins | proposed
      """
    When I parse the text
    Then change 1 has author "@ai:claude-opus-4.6"

  Scenario: Human namespace author format is preserved
    Given the input text is:
      """
      {--removed--}[^cn-1]

      [^cn-1]: @human:alice | 2026-02-10T09:00:00Z | del | proposed
      """
    When I parse the text
    Then change 1 has author "@human:alice"
