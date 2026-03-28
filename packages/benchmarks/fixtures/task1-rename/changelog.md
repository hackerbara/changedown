<!-- changedown.com/v1: tracked -->

# Event Sourcing Migration Changelog

This changelog tracks progress on the Event Sourcing migration for Order Management, as defined in [ADR-012](adr.md).

---

## Phase 1 — Dual-Write Implementation

### 2025-12-01: Phase 1 Kickoff

- Provisioned EventStoreDB cluster in staging environment (3-node, TLS enabled).
- Created `order-events` stream with access control policies.
- Implemented `OrderCreated` and `OrderItemAdded` event handlers in the write path.
- Dual-write adapter deployed behind feature flag `event-sourcing-dual-write`.

### 2025-12-15: Phase 1 Checkpoint

- All 8 event types implemented and writing to both PostgreSQL and EventStoreDB.
- Consistency validation job running hourly: 99.97% match rate over 14 days.
- Three discrepancies traced to clock skew in the `OrderRefunded` handler; fixed in commit `a3f91c2`.
- Event Sourcing write path adds 2.1ms p99 latency (within 5ms budget).

## Phase 2 — Read Path Cutover

### 2026-01-05: Phase 2 Kickoff

- Projection service deployed for `OrderView` read model.
- Catch-up replay completed for 2.4M historical orders (38 minutes wall time).
- Shadow-read comparison enabled: event-sourced projection vs. PostgreSQL direct read.

### 2026-01-20: Phase 2 Checkpoint

- Shadow-read match rate: 99.99% over 15 days (6 mismatches, all traced to timezone normalization).
- Event Sourcing read path p99 latency: 4.3ms (vs. 3.8ms PostgreSQL direct). Within acceptable range.
- Feature flag `event-sourcing-read-primary` enabled for 10% of production traffic.
- Full cutover scheduled for 2026-02-01 pending final sign-off.
