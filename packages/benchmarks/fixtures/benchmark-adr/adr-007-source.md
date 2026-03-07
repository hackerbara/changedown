# ADR-007: Event Sourcing for Audit Trail

## Context

We need durable audit trails for compliance. The current approach uses append-only 
logging, which is simple but loses causal relationships between events.

## Decision

Adopt event sourcing for the audit subsystem. Events are the source of truth; 
projections derive current state. See the rationale in our conclusion below.

## Implementation

Event store uses append-only writes. Projections rebuild from the full event stream 
on startup. The legacy logging approach will be phased out over two quarters.

## Migration

Migrate existing audit logs to event format. The legacy approach is retained as a 
fallback during the transition window.

## Conclusion

The strongest argument for event sourcing is that it makes every state transition 
independently verifiable — compliance auditors can reconstruct any point-in-time 
view without trusting application logic. This is the foundation the entire design 
rests on.
