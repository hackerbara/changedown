# Architecture Decision

The service mesh will use {++Envoy sidecars for all inter-service communication++}[^ct-1] rather than direct HTTP calls.

{==Connection pooling configuration needs load testing under production traffic patterns.==}[^ct-2]

Retry budgets are set to 20% of total request volume per service.

[^ct-1]: @alice | 2026-03-01 | ins | proposed
    @alice 2026-03-01: Envoy gives us observability and mTLS for free
    > @bob 2026-03-02: What about the latency overhead? P99 benchmarks?
    > @alice 2026-03-03: Measured at <2ms per hop. Acceptable for our SLOs.

[^ct-2]: @bob | 2026-03-02 | hl | proposed
    @bob 2026-03-02: Flagging for load test before merge
