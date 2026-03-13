# Preview Phase 2 Test Fixture

## Multi-Author Document (per-author colors)

{++Alice added this paragraph to set the stage for the feature discussion.++}[^ct-1]

{++Bob added this complementary paragraph with implementation details.++}[^ct-2]

{--Carol deleted this outdated reference to the old API.--}[^ct-3]

## metadataDetail: summary mode

Open the preview, then set `changetracks.preview.metadataDetail` to `"summary"` in settings. Each change anchor should show author + status inline.

{~~REST~>GraphQL~~}[^ct-4]

## metadataDetail: projected mode

Set `changetracks.preview.metadataDetail` to `"projected"`. All metadata should appear at the anchor. Footnote panel should show only the discussion thread.

## Full Deliberation (footnote panel)

{++The new billing integration supports Stripe and PayPal.++}[^ct-5]

## Move Group

First paragraph contains the {--original location of this text.--}[^ct-6.1]

Third paragraph is where it {++original location of this text.++}[^ct-6.2] ended up.

## Discussion Thread Labels

{++Rate limit set to 1000/min.++}[^ct-7]

---

## Footnote Definitions

[^ct-1]: @alice | 2024-01-15 | ins | proposed
    Setting context for the API migration discussion.

[^ct-2]: @bob | 2024-01-15 | ins | proposed
    Adding implementation specifics from the technical review.

[^ct-3]: @carol | 2024-01-16 | del | accepted
    approved: @alice 2024-01-17
    resolved @alice 2024-01-17: Confirmed outdated

[^ct-4]: @alice | 2024-01-15 | sub | accepted
    context: "The API should use {REST} for the public interface"
    approved: @eve 2024-01-20
    approved: @bob 2024-01-21 "Benchmarks look good"
    @dave 2024-01-16: GraphQL increases client complexity.
      @alice 2024-01-16: But reduces over-fetching. See PR #42.
        @dave 2024-01-17: Fair point. Benchmarks are convincing.
    revisions:
      r1 @alice 2024-01-16: "GraphQL with caching"
      r2 @alice 2024-01-18: "GraphQL with Apollo federation"
    resolved @dave 2024-01-17

[^ct-5]: @alice | 2024-02-01 | ins | proposed
    approved: @bob 2024-02-02
    request-changes: @carol 2024-02-02 "Add error handling for failed charges"
    @carol 2024-02-02 [issue]: What happens when a charge fails mid-checkout?
      @alice 2024-02-03: Added retry logic with exponential backoff.
        @carol 2024-02-03 [praise]: Looks solid now.
    open -- awaiting load test results from @dave

[^ct-6]: @alice | 2024-01-15 | sub | proposed
    Moved text from first paragraph to third paragraph for better flow.
[^ct-6.1]: @alice | 2024-01-15 | del | proposed
[^ct-6.2]: @alice | 2024-01-15 | ins | proposed

[^ct-7]: @bob | 2024-02-01 | ins | proposed
    @carol 2024-02-02 [question]: Is 1000/min enough for peak traffic?
    @bob 2024-02-02: Based on our p99 data, peak is 600/min.
      @carol 2024-02-03 [issue/blocking]: That's only 40% headroom.
        @bob 2024-02-03: Bumped to 2000/min in r2.
    @dave 2024-02-03 [todo]: Add rate limit monitoring dashboard.
    revisions:
      r1 @bob 2024-02-01: "1000/min"
      r2 @bob 2024-02-03: "2000/min"
