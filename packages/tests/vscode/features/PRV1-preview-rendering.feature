@fast @preview @PRV1
Feature: PRV1 — Preview HTML rendering from CriticMarkup

  Tests that buildReplacements() and related preview helpers correctly convert
  CriticMarkup source text into styled HTML for the VS Code markdown preview.

  # ── Basic CriticMarkup replacement ──────────────────────────────────

  Scenario: Insertion replaced with <ins> tag
    Given preview source text "Hello {++world++} there"
    When I build preview replacements
    Then the preview HTML contains "<ins class=\"ct-ins ct-proposed\" data-ct-pair=\"ct-pair-6\">world</ins>"
    And the preview HTML does not contain "{++"

  Scenario: Deletion replaced with <del> tag
    Given preview source text "Hello {--world--} there"
    When I build preview replacements
    Then the preview HTML contains "<del class=\"ct-del ct-proposed\" data-ct-pair=\"ct-pair-6\">world</del>"
    And the preview HTML does not contain "{--"

  Scenario: Substitution replaced with <del> + <ins>
    Given preview source text "Hello {~~old~>new~~} there"
    When I build preview replacements
    Then the preview HTML contains "<del class=\"ct-sub-del ct-proposed\" data-ct-pair=\"ct-pair-6\">old</del>"
    And the preview HTML contains "<ins class=\"ct-sub-ins ct-proposed\">new</ins>"

  Scenario: Highlight replaced with <mark> tag
    Given preview source text "Hello {==important==} there"
    When I build preview replacements
    Then the preview HTML contains "<mark class=\"ct-hl\" data-ct-pair=\"ct-pair-6\">important</mark>"

  Scenario: Comment replaced with tooltip span
    Given preview source text "Hello{>>a note<<} there"
    When I build preview replacements
    Then the preview HTML contains "class=\"ct-comment\""
    And the preview HTML contains "title=\"a note\""

  Scenario: Comments hidden when showComments is false
    Given preview source text "Hello{>>a note<<} there"
    And preview option showComments is false
    When I build preview replacements
    Then the preview HTML does not contain "ct-comment"
    And the preview HTML does not contain "{>>"

  # ── Multiple changes — reverse-order replacement ────────────────────

  Scenario: Multiple changes preserve offsets
    Given preview source text "A {++B++} C {--D--} E"
    When I build preview replacements
    Then the preview HTML contains "<ins class=\"ct-ins ct-proposed\" data-ct-pair=\"ct-pair-2\">B</ins>"
    And the preview HTML contains "<del class=\"ct-del ct-proposed\" data-ct-pair=\"ct-pair-12\">D</del>"
    And the preview HTML starts with "A "
    And the preview HTML ends with " E"

  # ── Code fence exclusion zones ──────────────────────────────────────

  Scenario: findFenceZones identifies fenced regions
    Given preview source text:
      """
      before
      ```js
      code
      ```
      after
      """
    When I find fence zones
    Then 1 fence zone is found
    And fence zone 1 starts at or before the first code fence
    And fence zone 1 ends at or after the last code fence

  Scenario: CriticMarkup inside code fences is preserved
    Given preview source text:
      """
      Real {++change++}
      ```js
      {++not a change++}
      ```

      """
    When I build preview replacements
    Then the preview HTML contains "<ins class=\"ct-ins ct-proposed\" data-ct-pair=\"ct-pair-5\">change</ins>"
    And the preview HTML contains "{++not a change++}"

  Scenario: Multiple fence zones detected
    Given preview source text:
      """
      ```
      a
      ```
      {++real++}
      ```
      b
      ```
      """
    When I find fence zones
    Then 2 fence zones are found

  # ── HTML escaping ───────────────────────────────────────────────────

  Scenario: HTML in change content is escaped
    Given preview source text "{++<script>alert(\"xss\")</script>++}"
    When I build preview replacements
    Then the preview HTML does not contain "<script>"
    And the preview HTML contains "&lt;script&gt;"

  Scenario: HTML in comment title attribute is escaped
    Given preview source text "{>>say \"hello\" & goodbye<<}"
    When I build preview replacements
    Then the preview HTML contains "&quot;"
    And the preview HTML contains "&amp;"

  # ── Footnote refs ───────────────────────────────────────────────────

  Scenario: Footnote ref replaced with styled badge
    Given preview source text:
      """
      {++text++}[^ct-1]

      [^ct-1]: @alice | 2026-02-17 | insertion | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "<sup class=\"ct-ref\""
    And the preview HTML contains "ct-1"

  # ── Footnote ref <-> definition anchor linking ──────────────────────

  Scenario: Inline ref links to footnote definition
    Given preview source text:
      """
      Added {++new content++}[^ct-1] and {--old content--}[^ct-2].

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-16 | del | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "href=\"#ct-fn-def-ct-1\""
    And the preview HTML contains "href=\"#ct-fn-def-ct-2\""

  Scenario: Footnote definition has matching id
    Given preview source text:
      """
      Added {++new content++}[^ct-1] and {--old content--}[^ct-2].

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-16 | del | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "id=\"ct-fn-def-ct-1\""
    And the preview HTML contains "id=\"ct-fn-def-ct-2\""

  Scenario: Footnote definition has back-link to inline ref
    Given preview source text:
      """
      Added {++new content++}[^ct-1] and {--old content--}[^ct-2].

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-16 | del | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "href=\"#ct-fn-ref-ct-1\""
    And the preview HTML contains "ct-fn-backlink"

  Scenario: Inline ref has id for back-link target
    Given preview source text:
      """
      Added {++new content++}[^ct-1] and {--old content--}[^ct-2].

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-16 | del | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "id=\"ct-fn-ref-ct-1\""
    And the preview HTML contains "id=\"ct-fn-ref-ct-2\""

  # ── Footnote deliberation rendering ─────────────────────────────────

  Scenario: Context line rendered in footnote panel
    Given preview source text:
      """
      The API should use {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | accepted
          context: "The API should use {REST} for the public interface"
          approved: @eve 2024-01-20
          approved: @bob 2024-01-21 "Benchmarks look good"
          @dave 2024-01-16: GraphQL increases client complexity.
            @alice 2024-01-16: But reduces over-fetching. See PR #42.
              @dave 2024-01-17: Fair point. Benchmarks are convincing.
          resolved @dave 2024-01-17
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-context"
    And the preview HTML contains "The API should use"
    And the preview HTML contains "ct-ctx-changed"

  Scenario: Approval badges rendered in footnote panel
    Given preview source text:
      """
      The API should use {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | accepted
          context: "The API should use {REST} for the public interface"
          approved: @eve 2024-01-20
          approved: @bob 2024-01-21 "Benchmarks look good"
          @dave 2024-01-16: GraphQL increases client complexity.
            @alice 2024-01-16: But reduces over-fetching. See PR #42.
              @dave 2024-01-17: Fair point. Benchmarks are convincing.
          resolved @dave 2024-01-17
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-approval"
    And the preview HTML contains "@eve"
    And the preview HTML contains "@bob"
    And the preview HTML contains "Benchmarks look good"

  Scenario: Discussion thread rendered with nesting
    Given preview source text:
      """
      The API should use {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | accepted
          context: "The API should use {REST} for the public interface"
          approved: @eve 2024-01-20
          approved: @bob 2024-01-21 "Benchmarks look good"
          @dave 2024-01-16: GraphQL increases client complexity.
            @alice 2024-01-16: But reduces over-fetching. See PR #42.
              @dave 2024-01-17: Fair point. Benchmarks are convincing.
          resolved @dave 2024-01-17
      """
    When I build preview replacements
    Then the preview HTML contains "ct-discussion-comment"
    And the preview HTML contains "@dave"
    And the preview HTML contains "GraphQL increases client complexity"
    And the preview HTML contains "ct-reply-depth-1"
    And the preview HTML contains "But reduces over-fetching"
    And the preview HTML contains "ct-reply-depth-2"
    And the preview HTML contains "Fair point"

  Scenario: Resolution status rendered
    Given preview source text:
      """
      The API should use {~~REST~>GraphQL~~}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | sub | accepted
          context: "The API should use {REST} for the public interface"
          approved: @eve 2024-01-20
          approved: @bob 2024-01-21 "Benchmarks look good"
          @dave 2024-01-16: GraphQL increases client complexity.
            @alice 2024-01-16: But reduces over-fetching. See PR #42.
              @dave 2024-01-17: Fair point. Benchmarks are convincing.
          resolved @dave 2024-01-17
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-resolution"
    And the preview HTML contains "resolved"
    And the preview HTML contains "@dave"

  Scenario: Open resolution rendered
    Given preview source text:
      """
      Text {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          open -- awaiting review from @bob
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-resolution"
    And the preview HTML contains "ct-open"
    And the preview HTML contains "awaiting review"

  Scenario: Revisions list rendered
    Given preview source text:
      """
      Use {~~OAuth~>OAuth 2.0 with JWT~~}[^ct-1]

      [^ct-1]: @bob | 2024-01-15 | sub | proposed
          revisions:
            r1 @bob 2024-01-16: "OAuth 2.0"
            r2 @bob 2024-01-18: "OAuth 2.0 with JWT tokens"
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-revisions"
    And the preview HTML contains "r1"
    And the preview HTML contains "r2"
    And the preview HTML contains "OAuth 2.0 with JWT tokens"

  Scenario: Comment labels rendered as badges
    Given preview source text:
      """
      Text {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          @bob 2024-01-16 [question]: What about latency?
          @carol 2024-01-17 [issue/blocking]: Rate limit too low.
      """
    When I build preview replacements
    Then the preview HTML contains "ct-label"
    And the preview HTML contains "question"
    And the preview HTML contains "issue"

  Scenario: Rejection badges rendered
    Given preview source text:
      """
      Text {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          rejected: @carol 2024-01-19 "Needs more benchmarking"
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-rejection"
    And the preview HTML contains "@carol"
    And the preview HTML contains "Needs more benchmarking"

  Scenario: Request-changes badges rendered
    Given preview source text:
      """
      Text {++added++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          request-changes: @eve 2024-01-18 "Pick one protocol"
      """
    When I build preview replacements
    Then the preview HTML contains "ct-fn-request-changes"
    And the preview HTML contains "Pick one protocol"

  # ── Move group directional indicators ───────────────────────────────

  Scenario: Move-from has directional label
    Given preview source text:
      """
      Paragraph one. {--Moved text.--}[^ct-1.1]

      Paragraph two. {++Moved text.++}[^ct-1.2]

      [^ct-1]: @alice | 2024-01-15 | move | proposed
          Moved text from paragraph one to paragraph two.
      [^ct-1.1]: @alice | 2024-01-15 | del | proposed
      [^ct-1.2]: @alice | 2024-01-15 | ins | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "ct-move-label"
    And the preview HTML contains "ct-move-from"

  Scenario: Move-to has directional label
    Given preview source text:
      """
      Paragraph one. {--Moved text.--}[^ct-1.1]

      Paragraph two. {++Moved text.++}[^ct-1.2]

      [^ct-1]: @alice | 2024-01-15 | move | proposed
          Moved text from paragraph one to paragraph two.
      [^ct-1.1]: @alice | 2024-01-15 | del | proposed
      [^ct-1.2]: @alice | 2024-01-15 | ins | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "ct-move-to"

  Scenario: Move labels link to paired change
    Given preview source text:
      """
      Paragraph one. {--Moved text.--}[^ct-1.1]

      Paragraph two. {++Moved text.++}[^ct-1.2]

      [^ct-1]: @alice | 2024-01-15 | move | proposed
          Moved text from paragraph one to paragraph two.
      [^ct-1.1]: @alice | 2024-01-15 | del | proposed
      [^ct-1.2]: @alice | 2024-01-15 | ins | proposed
      """
    When I build preview replacements
    Then the preview HTML contains "href=\"#ct-fn-ref-ct-1.2\"" or "href=\"#ct-fn-ref-ct-1.1\""

  # ── metadataDetail: summary mode ────────────────────────────────────

  Scenario: Summary mode shows author annotation at anchor
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @bob 2024-01-16
      """
    And preview option metadataDetail is "summary"
    When I build preview replacements
    Then the preview HTML contains "ct-anchor-meta"
    And the preview HTML contains "@alice"

  Scenario: Summary mode shows status annotation at anchor
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @bob 2024-01-16
      """
    And preview option metadataDetail is "summary"
    When I build preview replacements
    Then the preview HTML contains "ct-anchor-status"
    And the preview HTML contains "proposed"

  Scenario: Badge mode does NOT show anchor metadata
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @bob 2024-01-16
      """
    And preview option metadataDetail is "badge"
    When I build preview replacements
    Then the preview HTML does not contain "ct-anchor-meta"

  Scenario: Summary mode still shows deliberation in footnote panel
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          approved: @bob 2024-01-16
      """
    And preview option metadataDetail is "summary"
    When I build preview replacements
    Then the preview HTML contains "ct-fn-approval"
    And the preview HTML contains "@bob"

  Scenario: Level-0 change does NOT produce ct-anchor-meta in summary mode
    Given preview source text "Hello {++world++} there"
    And preview option metadataDetail is "summary"
    When I build preview replacements
    Then the preview HTML contains "<ins class=\"ct-ins ct-proposed\" data-ct-pair=\"ct-pair-6\">world</ins>"
    And the preview HTML does not contain "ct-anchor-meta"

  # ── metadataDetail: projected mode ──────────────────────────────────

  Scenario: Projected mode shows author, date, status at anchor
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          Adds the billing integration.
          approved: @bob 2024-01-16
          @carol 2024-01-17: Looks good to me.
      """
    And preview option metadataDetail is "projected"
    When I build preview replacements
    Then the preview HTML contains "ct-anchor-meta"
    And the preview HTML contains "@alice"
    And the preview HTML contains "2024-01-15"
    And the preview HTML contains "ct-anchor-status"
    And the preview HTML contains "proposed"

  Scenario: Projected mode shows comment text at anchor
    Given preview source text:
      """
      Some text{>>Reviewer note<<}[^ct-2] here.

      [^ct-2]: @alice | 2024-01-15 | comment | proposed
      """
    And preview option metadataDetail is "projected"
    When I build preview replacements
    Then the preview HTML contains "ct-anchor-comment"
    And the preview HTML contains "Reviewer note"

  Scenario: Projected mode shows approval count at anchor
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          Adds the billing integration.
          approved: @bob 2024-01-16
          @carol 2024-01-17: Looks good to me.
      """
    And preview option metadataDetail is "projected"
    When I build preview replacements
    Then the preview HTML contains "ct-anchor-approvals"

  Scenario: Projected mode footnote panel shows only discussion threads
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          Adds the billing integration.
          approved: @bob 2024-01-16
          @carol 2024-01-17: Looks good to me.
      """
    And preview option metadataDetail is "projected"
    When I build preview replacements
    Then the preview HTML contains "ct-discussion-comment"
    And the preview HTML contains "@carol"
    And the preview HTML contains "ct-fn-discussion-only"
    And the preview HTML does not contain "ct-fn-status"

  Scenario: Badge mode does not show anchor comment
    Given preview source text:
      """
      The {++new feature++}[^ct-1] was released.

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
          Adds the billing integration.
          approved: @bob 2024-01-16
          @carol 2024-01-17: Looks good to me.
      """
    And preview option metadataDetail is "badge"
    When I build preview replacements
    Then the preview HTML does not contain "ct-anchor-comment"

  # ── Per-author colors ───────────────────────────────────────────────

  Scenario: Per-author inline styles applied for 2+ authors
    Given preview source text:
      """
      {++Alice added this.++}[^ct-1]
      {++Bob added this.++}[^ct-2]
      {--Alice deleted this.--}[^ct-3]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-15 | ins | proposed
      [^ct-3]: @alice | 2024-01-16 | del | proposed
      """
    And preview option authorColors is "auto"
    When I build preview replacements
    Then the preview HTML has at least 2 distinct author color styles

  Scenario: Deletion spans do NOT get per-author color
    Given preview source text:
      """
      {++Alice added this.++}[^ct-1]
      {++Bob added this.++}[^ct-2]
      {--Alice deleted this.--}[^ct-3]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-15 | ins | proposed
      [^ct-3]: @alice | 2024-01-16 | del | proposed
      """
    And preview option authorColors is "auto"
    When I build preview replacements
    Then the preview HTML <del> tags do not have per-author color

  Scenario: Single author does not trigger per-author colors in auto mode
    Given preview source text:
      """
      {++Added.++}[^ct-1]
      {++Also added.++}[^ct-2]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @alice | 2024-01-16 | ins | proposed
      """
    And preview option authorColors is "auto"
    When I build preview replacements
    Then the preview HTML does not contain "style=\"color:"

  Scenario: authorColors never disables per-author colors
    Given preview source text:
      """
      {++Alice added this.++}[^ct-1]
      {++Bob added this.++}[^ct-2]
      {--Alice deleted this.--}[^ct-3]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      [^ct-2]: @bob | 2024-01-15 | ins | proposed
      [^ct-3]: @alice | 2024-01-16 | del | proposed
      """
    And preview option authorColors is "never"
    When I build preview replacements
    Then the preview HTML does not contain "style=\"color:"

  Scenario: authorColors always enables colors even for single author
    Given preview source text:
      """
      {++Added.++}[^ct-1]

      [^ct-1]: @alice | 2024-01-15 | ins | proposed
      """
    And preview option authorColors is "always"
    When I build preview replacements
    Then the preview HTML contains "style=\"color:"

  # ── PreviewPlugin — markdown-it integration helpers ─────────────────

  Scenario: containsCriticMarkup detects insertion
    Given code text "code {++here++}"
    Then containsCriticMarkup returns true

  Scenario: containsCriticMarkup detects deletion
    Given code text "code {--here--}"
    Then containsCriticMarkup returns true

  Scenario: containsCriticMarkup detects substitution
    Given code text "code {~~a~>b~~}"
    Then containsCriticMarkup returns true

  Scenario: containsCriticMarkup returns false for plain code
    Given code text "const x = 42;"
    Then containsCriticMarkup returns false

  Scenario: containsCriticMarkup returns false for similar-looking syntax
    Given code text "obj = {key: value}"
    Then containsCriticMarkup returns false

  Scenario: renderFenceWithCriticMarkup renders styled code fence
    Given code text "{++added line++}\nplain line"
    And fence language "js"
    When I render the fence with CriticMarkup
    Then the fence HTML contains "<pre>"
    And the fence HTML contains "<code"
    And the fence HTML contains "language-js"
    And the fence HTML contains "ct-ins"

  Scenario: renderFenceWithCriticMarkup escapes HTML
    Given code text "<div>{++x++}</div>"
    And fence language "html"
    When I render the fence with CriticMarkup
    Then the fence HTML contains "&lt;div&gt;"

  Scenario: renderFenceWithCriticMarkup handles code with no lang
    Given code text "{--removed--}"
    And fence language ""
    When I render the fence with CriticMarkup
    Then the fence HTML contains "<pre>"
    And the fence HTML contains "ct-del"
