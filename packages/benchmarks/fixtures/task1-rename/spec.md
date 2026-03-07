
# Event Sourcing Specification

**Version:** 1.0
**Effective Date:** 2026-01-15
**Related:** [ADR-012](adr.md)

## Overview

This document defines the Event Sourcing specification for the Order Management bounded context. All services that produce or consume order events must conform to these schemas and contracts. Event Sourcing requires that every state change is captured as an immutable event record.

## Event Schema

Every event persisted to the event store must include the following fields:

| Field | Type | Description |
|---|---|---|
| `event_id` | UUID v7 | Globally unique identifier, time-ordered |
| `aggregate_id` | UUID v4 | Identifier of the order aggregate |
| `event_type` | string | Fully qualified event name (e.g., `order.created`) |
| `payload` | JSON object | Event-specific data (see per-type schemas below) |
| `timestamp` | ISO 8601 | Wall-clock time when the event was produced |
| `version` | integer | Monotonically increasing per aggregate, starting at 1 |

## Event Types

The following event types are defined for the Event Sourcing implementation:

- **OrderCreated** — Emitted when a new order is initialized with customer and item data.
- **OrderItemAdded** — Emitted when an item is appended to a pending order.
- **OrderItemRemoved** — Emitted when an item is removed from a pending order.
- **OrderConfirmed** — Emitted when payment is authorized and the order transitions to confirmed.
- **OrderShipped** — Emitted when the fulfillment service reports shipment dispatch.
- **OrderDelivered** — Emitted when delivery confirmation is received from the carrier.
- **OrderCancelled** — Emitted when the order is cancelled by the customer or system.
- **OrderRefunded** — Emitted when a partial or full refund is processed.

## Projection Rules

Projections derive read-optimized views from the event stream. Each projection must be idempotent and must tolerate out-of-order delivery during catch-up replays. The canonical projection for order state applies events in version order to produce a single `OrderView` record per aggregate.

Projections must handle unknown event types gracefully by logging a warning and skipping the event. This ensures forward compatibility when new Event Sourcing event types are introduced.

## Performance Considerations

- **Snapshot interval:** Aggregates with more than 100 events must have a snapshot. Snapshots are stored alongside events and include the version number at which they were taken.
- **Replay ceiling:** Cold-start replay for a single aggregate must complete within 50ms. If this target is exceeded, reduce the snapshot interval.
- **Retention:** Events are retained indefinitely. Storage growth is estimated at 2.4 GB/month based on current order volume (800k orders/month, average 6 events per order, average 500 bytes per event).
- **Compaction:** Event Sourcing streams are never compacted or truncated. If storage becomes a concern, archive cold aggregates (no events in 12+ months) to object storage with a tombstone marker in the primary store.
