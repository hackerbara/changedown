<!-- changedown.com/v1: tracked -->

# Review Panel Test

This document tests the review panel display across different change stages.

## Proposed Insertion

The service {++implements circuit breakers for all downstream dependencies++}[^cn-1] to prevent cascading failures.

## Proposed Substitution

The data serialization uses {~~XML with XSLT transforms~>Protocol Buffers with schema evolution~~}[^cn-2] for efficiency.

## Accepted Change

The health check endpoint {++returns detailed component status including database, cache, and queue connectivity++}[^cn-3] for monitoring.

## Rejected Deletion

The admin dashboard {--requires VPN access for all administrative operations--}[^cn-4] for security.

## Highlighted Text With Comment

{==The SLA guarantees 99.9% uptime for the public API with a 200ms p99 latency target.==}{>>This SLA needs legal review before publishing to customers.<<}[^cn-5]

[^cn-1]: @alice | 2026-03-09 | ins | proposed
    @alice 2026-03-09T08:00:00Z: Circuit breakers prevent cascading failures

[^cn-2]: @bob | 2026-03-09 | sub | proposed
    @bob 2026-03-09T08:10:00Z: Protocol Buffers are more efficient for inter-service communication

[^cn-3]: @alice | 2026-03-08 | ins | accepted
    @alice 2026-03-08T14:00:00Z: Detailed health checks for operational visibility
    approved: @bob 2026-03-08T14:30:00Z "Needed for monitoring integration"

[^cn-4]: @bob | 2026-03-08 | del | rejected
    @bob 2026-03-08T15:00:00Z: VPN requirement adds friction for remote team
    rejected: @alice 2026-03-08T15:20:00Z "VPN access is required by security policy"

[^cn-5]: @alice | 2026-03-09 | hlt | proposed
    @alice 2026-03-09T09:00:00Z: Flagging SLA commitment for legal review
