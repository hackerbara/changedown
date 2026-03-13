<!-- ctrcks.com/v1: tracked -->

# Glossary

Key terms used throughout the Event Sourcing documentation for Order Management.

---

## Event Sourcing

A persistence pattern in which state changes are stored as a sequence of immutable events rather than as mutable row updates. The current state of an entity is derived by replaying its event history through a projection function. Event Sourcing provides a complete audit trail and enables temporal queries, event replay, and retroactive rule evaluation.

## Event Store

The append-only database that persists domain events. In our implementation, this is EventStoreDB. The event store guarantees ordering within a stream (per aggregate) and provides subscription APIs for downstream consumers.

## Projection

A function that processes a sequence of events to produce a read-optimized view (also called a "read model"). Projections are idempotent and deterministic. Multiple projections can derive different views from the same event stream.

## Snapshot

A point-in-time serialization of an aggregate's current state, stored alongside the event stream to avoid replaying the full history on every load. Snapshots are an optimization — they are not authoritative. The event stream is always the source of truth.

## Aggregate

A cluster of domain objects treated as a single unit for data changes. In the Order Management context, the `Order` aggregate includes the order header, line items, and status. All events within an aggregate share the same `aggregate_id` and are versioned sequentially.
