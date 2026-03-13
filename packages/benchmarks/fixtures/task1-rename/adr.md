<!-- ctrcks.com/v1: tracked -->

# ADR-012: Adopt Event Sourcing for Order Management

**Date:** 2025-11-15
**Author:** @sarah-chen
**Status:** Accepted
**Context:** Order Management Domain

## Context

The Order Management service currently persists order state as mutable rows in a PostgreSQL database. When an order transitions from `pending` to `confirmed` to `shipped`, the previous state is overwritten. This creates several operational problems:

1. **No audit trail.** Customer support cannot determine why an order was modified or when a specific change occurred. Dispute resolution requires manual log correlation across three services.
2. **Lost business intelligence.** Product analytics needs historical state transitions to model conversion funnels, but the current schema only stores the latest snapshot.
3. **Concurrency bugs.** Two concurrent updates to the same order occasionally produce corrupted state because the ORM performs read-modify-write cycles without optimistic locking.
4. **Replay impossibility.** When we deploy pricing rule changes, we cannot retroactively verify how existing orders would have been affected under the new rules.

The team has evaluated several persistence strategies and concluded that Event Sourcing addresses all four problems simultaneously. See the [Event Sourcing Glossary](glossary.md#event-sourcing) for terminology used throughout this document, and the [Event Sourcing specification](spec.md) for the formal event schema and projection rules.

## Decision

We will adopt **Event Sourcing** as the persistence strategy for the Order Management bounded context, effective Q1 2026.

### Storage Model

All state changes will be recorded as immutable event objects appended to an event store. The current order state will be derived by replaying events through a projection function. Snapshots will be taken every 100 events to bound replay time.

### Event Design

Events follow the past-tense naming convention (`OrderCreated`, not `CreateOrder`) and carry the minimum payload required to reconstruct state. Each event includes a monotonically increasing version number for optimistic concurrency control.

### Reference Implementation

The following Python example demonstrates the core Event Sourcing pattern for order aggregates:

```python
# Event Sourcing implementation for Order aggregate
# Each method appends an event rather than mutating state directly

class OrderAggregate:
    """Order aggregate root using Event Sourcing pattern."""

    def __init__(self, order_id: str):
        self.order_id = order_id
        self.events: list[DomainEvent] = []
        self.version = 0
        # Event Sourcing requires explicit state reconstruction
        self._status = "initialized"
        self._items: list[OrderItem] = []

    def create(self, customer_id: str, items: list[OrderItem]) -> None:
        # Event Sourcing: append event instead of setting fields
        event = OrderCreated(
            order_id=self.order_id,
            customer_id=customer_id,
            items=items,
            timestamp=datetime.utcnow(),
        )
        self._apply(event)

    def add_item(self, item: OrderItem) -> None:
        if self._status != "pending":
            raise InvalidOperationError("Cannot add items to a non-pending order")
        event = OrderItemAdded(order_id=self.order_id, item=item)
        self._apply(event)

    def _apply(self, event: DomainEvent) -> None:
        """Apply event to local state and record it for persistence."""
        self.events.append(event)
        self.version += 1
        # Event Sourcing projection: derive state from event
        if isinstance(event, OrderCreated):
            self._status = "pending"
            self._items = list(event.items)
        elif isinstance(event, OrderItemAdded):
            self._items.append(event.item)
```

## Alternatives Considered

| Alternative | Verdict | Reason |
|---|---|---|
| Change Data Capture (Debezium) | Rejected | Captures physical row changes, not domain intent. Event Sourcing preserves business semantics. |
| Audit log table | Rejected | Adds complexity without enabling replay or temporal queries. |
| CQRS without Event Sourcing | Deferred | Useful optimization but does not solve the audit trail problem on its own. |

## Migration Plan

The migration to Event Sourcing will proceed in two phases. See the [changelog](changelog.md) for detailed progress tracking.

- **Phase 1 (Weeks 1-4):** Dual-write mode. The service writes to both the existing PostgreSQL tables and the new event store. Read path remains unchanged.
- **Phase 2 (Weeks 5-8):** Cut over read path to event-sourced projections. Validate consistency. Decommission legacy write path.

## Consequences

**Positive:**
- Complete audit trail for every order state transition
- Ability to replay events for debugging, analytics, and rule verification
- Natural fit for CQRS read model optimization in future iterations
- Eliminates concurrency corruption through append-only writes with version checks

**Negative:**
- Increased storage requirements (~3x for the order domain)
- Team must learn Event Sourcing patterns and eventual consistency trade-offs
- Schema evolution for events requires a compatibility strategy (see [Event Sourcing specification](spec.md))
- Snapshot management adds operational overhead
