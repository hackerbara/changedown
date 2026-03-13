<!-- ctrcks.com/v1: tracked -->

# Amend/Supersede Guard Test

This document tests ownership guards for amend and supersede operations.

## Alice's Proposed Change

The service mesh {++routes traffic through an Envoy sidecar proxy++}[^ct-1] for load balancing.

## Bob's Proposed Change

The deployment pipeline {++includes canary releases with automated rollback++}[^ct-2] for safety.

## Already Accepted Change

The monitoring stack uses {++Prometheus with Grafana dashboards for real-time alerting++}[^ct-3] in production.

## Already Rejected Deletion

The feature flag system {--will be replaced with a third-party solution--}[^ct-4] for simplicity.

[^ct-1]: @alice | 2026-03-09 | ins | proposed
    @alice 2026-03-09T14:00:00Z: Adding service mesh for traffic management

[^ct-2]: @bob | 2026-03-09 | ins | proposed
    @bob 2026-03-09T14:05:00Z: Canary releases reduce deployment risk

[^ct-3]: @alice | 2026-03-08 | ins | accepted
    @alice 2026-03-08T09:00:00Z: Adding monitoring stack
    approved: @bob 2026-03-08T09:30:00Z "Essential for production visibility"

[^ct-4]: @bob | 2026-03-08 | del | rejected
    @bob 2026-03-08T10:00:00Z: Proposing migration to external feature flag service
    rejected: @alice 2026-03-08T10:30:00Z "We need in-house control over feature flags"
