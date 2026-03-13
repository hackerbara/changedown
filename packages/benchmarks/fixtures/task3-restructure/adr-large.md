<!-- ctrcks.com/v1: tracked -->

# ADR-019: Adopt Apache Kafka for Message Queue Architecture

**Date:** 2025-10-20
**Author:** @james-park
**Status:** Accepted
**Reviewers:** @lisa-wong, @david-kumar, @sarah-chen

## Context

### Current Architecture

The platform currently uses a combination of direct HTTP calls and a shared PostgreSQL-based job queue (`pg_notify` + polling) for asynchronous communication between services. This architecture was sufficient when the platform had 8 services and processed approximately 5,000 events per minute.

```
┌─────────────┐     HTTP      ┌─────────────┐
│ Order Svc   │──────────────▶│ Inventory   │
└─────────────┘               └─────────────┘
       │                             │
       │ pg_notify                   │ pg_notify
       ▼                             ▼
┌─────────────────────────────────────────────┐
│              PostgreSQL Job Queue            │
│         (shared `events` table)              │
└─────────────────────────────────────────────┘
       │                             │
       ▼                             ▼
┌─────────────┐               ┌─────────────┐
│ Notification│               │ Analytics   │
│ Service     │               │ Pipeline    │
└─────────────┘               └─────────────┘
```

The current architecture has reached its limits:

- **Throughput ceiling:** The PostgreSQL job queue saturates at approximately {~~12,000 events/minute~>12,000 events per minute~~}[^ct-2.1]. The platform now processes 45,000 events/minute at peak, causing queue backlogs of 20+ minutes during traffic spikes.
- **Coupling:** 14 of 32 services make synchronous HTTP calls for operations that should be asynchronous, creating cascading failure scenarios. In Q3 2025, an inventory service outage caused order processing to halt for 47 minutes.
- **Fan-out cost:** When an order event needs to reach 6 downstream consumers, the job queue creates 6 separate rows. This multiplies write volume and creates contention on the shared `events` table.
- **No replay:** Once a consumer acknowledges a job queue row, it is deleted. There is no ability to replay events for debugging, backfilling, or onboarding new consumers.

The team has evaluated several message queue technologies to replace the PostgreSQL job queue. See the alternatives analysis below for a detailed comparison of the candidates.

### Requirements

| Requirement | Priority | Target |
|---|---|---|
| Throughput | P0 | 200,000 events/minute sustained |
| Latency (p99) | P0 | < 50ms end-to-end |
| Durability | P0 | No event loss (replication factor ≥ 3) |
| Fan-out | P0 | Single write, multiple consumers |
| Replay | P1 | 30-day event retention minimum |
| Ordering | P1 | Per-entity ordering (not global) |
| Schema evolution | P1 | Backward-compatible schema changes |
| Multi-datacenter | P2 | Active-passive replication |
| Transactions | P2 | Exactly-once semantics for critical paths |

## Decision

### Why Kafka

After evaluating the alternatives, we have selected Apache Kafka as the platform's message queue infrastructure. Kafka is the strongest fit across our P0 and P1 requirements:

1. **Throughput:** Kafka routinely handles millions of events per second in production deployments. Our target of 200,000 events/minute (3,333/second) is well within Kafka's comfort zone, leaving substantial headroom for growth.
2. **Fan-out model:** Kafka's consumer group abstraction enables multiple independent consumers to read from the same topic without duplicating writes. This directly solves the fan-out cost problem in our current architecture.
3. **Replay:** Kafka retains events for a configurable duration (we will configure 30 days). Any consumer can rewind its offset to replay historical events — enabling debugging, backfilling, and zero-downtime onboarding of new consumers.
4. **Ordering guarantees:** Kafka guarantees ordering within a partition. By keying messages on the entity ID (e.g., `order_id`), all events for a given entity are processed in order.
5. **Ecosystem:** Kafka Connect, Schema Registry, and ksqlDB provide a mature ecosystem for integration, schema management, and stream processing.

See the alternatives analysis below for a detailed comparison of why RabbitMQ, SQS+SNS, and Pulsar were not selected.

### Proposed Architecture

```
┌─────────────┐                          ┌─────────────┐
│ Order Svc   │──produce──▶ orders ◀──consume──│ Notification│
└─────────────┘            topic               │ Service     │
       │                     │                 └─────────────┘
       │                     │
       ▼                     ▼
┌─────────────┐         ┌─────────────┐
│ Inventory   │◀───consume───│             │
│ Service     │         │   Kafka     │
└─────────────┘         │   Cluster   │
                        │  (3 broker) │
┌─────────────┐         │             │
│ Analytics   │◀───consume───│             │
│ Pipeline    │         └─────────────┘
└─────────────┘              ▲
                             │
┌─────────────┐              │
│ Payment Svc │──produce─────┘
└─────────────┘         payments
                         topic
```

### Topic Design

Topics follow a `domain.entity.event-type` naming convention with consistent partitioning:

| Topic | Partitions | Key | Retention | Consumers |
|---|---|---|---|---|
| `order.events` | 12 | `order_id` | 30 days | Inventory, Notification, Analytics, Billing |
| `payment.events` | 8 | `payment_id` | 90 days | Order, Notification, Analytics, Compliance |
| `inventory.events` | 6 | `sku_id` | 30 days | Order, Analytics, Warehouse |
| `user.events` | 4 | `user_id` | 30 days | Notification, Analytics, Marketing |
| `platform.deadletter` | 4 | original topic | 365 days | Ops team (manual investigation) |

Partition counts are based on expected throughput per topic, with a target of 5,000 events/second per partition. Partitions can be increased (never decreased) as traffic grows.

### Consumer Group Strategy

Each logical consumer operates as a Kafka consumer group:

- **Independent processing:** Each consumer group maintains its own offset, enabling independent progress and replay without affecting other consumers.
- **Horizontal scaling:** Adding instances to a consumer group automatically rebalances partitions across instances. Maximum parallelism equals partition count.
- **Failure isolation:** A slow or failed consumer group does not affect other groups. Lag monitoring per group enables targeted intervention.

Consumer groups follow a `{service-name}.{purpose}` naming convention (e.g., `notification-service.order-alerts`, `analytics-pipeline.order-metrics`).

### Error Handling

Failed message processing follows a graduated retry strategy:

1. **Immediate retry (3x):** Transient failures (network timeout, database lock) are retried immediately with exponential backoff (100ms, 500ms, 2s).
2. **Retry topic:** After 3 immediate failures, the message is published to a `{topic}.retry` topic with a 5-minute delay (implemented via consumer pause).
3. **Dead letter queue:** After 2 retry-topic attempts, the message is published to `platform.deadletter` with full context (original topic, partition, offset, error details, attempt count).
4. **Alerting:** Any message reaching the dead letter queue triggers a PagerDuty alert to the owning team.

Messages in the dead letter queue are investigated manually. The ops dashboard provides tooling to inspect, replay, or discard dead-lettered messages.

## Alternatives Considered

### RabbitMQ

RabbitMQ is a mature message broker with excellent support for complex routing patterns, priority queues, and request-reply semantics.

**Pros:**
- Rich routing (topic exchanges, headers exchanges, fanout exchanges) with fine-grained binding rules.
- Built-in support for priority queues, TTL, and delayed messages.
- Lower operational complexity than Kafka for small-to-medium deployments.
- Excellent client library support across all platform languages (Go, Python, TypeScript).
- Management UI provides real-time queue inspection and message tracing.

**Cons:**
- **Throughput ceiling:** RabbitMQ's per-queue throughput peaks at approximately 20,000 messages/second with persistence enabled. While sufficient for current load, this leaves limited headroom for the 5x growth projected over 2 years.
- **No native replay:** Once a message is acknowledged, it is removed from the queue. Implementing replay requires a separate event store or plugin (e.g., rabbitmq-event-exchange), adding complexity.
- **Fan-out cost:** While fanout exchanges enable multi-consumer patterns, each consumer binding creates a separate queue with its own copy of the message, multiplying storage.
- **Ordering:** RabbitMQ guarantees ordering within a single queue, but consistent hashing to route entity-keyed messages to specific queues requires the `rabbitmq_consistent_hash_exchange` plugin, which is less battle-tested than Kafka's partitioning.

**Verdict:** Strong alternative for routing-heavy use cases, but the lack of native replay and lower throughput ceiling make it a weaker fit for our event-driven architecture requirements.

### Amazon SQS + SNS

AWS-native messaging using SNS for fan-out and SQS for per-consumer queues.

**Pros:**
- Zero operational overhead — fully managed by AWS.
- Effectively unlimited throughput (auto-scales transparently).
- Native integration with Lambda, EventBridge, and other AWS services.
- SQS FIFO queues provide exactly-once processing with message deduplication.
- Cost-effective at low-to-medium volume ($0.40 per million requests).

**Cons:**
- **No replay:** SQS messages are deleted after processing. There is no offset-based replay mechanism. Implementing replay requires writing every message to a secondary store (S3, DynamoDB), effectively building a custom event store.
- **Ordering limitations:** FIFO queues support ordering within a message group, but are limited to 3,000 messages/second per queue (with batching). Standard queues offer higher throughput but provide only best-effort ordering.
- **Vendor lock-in:** Heavy dependence on AWS-specific APIs and behaviors. Multi-cloud or hybrid deployment becomes impractical.
- **Cost at scale:** At 200,000 events/minute with 4 consumers each, cost is approximately $7,000/month for SQS+SNS alone, excluding data transfer and secondary storage for replay.
- **Latency variance:** SQS long-polling introduces variable latency (20ms-200ms) that is difficult to control.

**Verdict:** Excellent for teams prioritizing operational simplicity over replay capability. The lack of native replay and vendor lock-in are disqualifying for our requirements.

### Apache Pulsar

Pulsar is a cloud-native distributed messaging platform that combines messaging and stream storage.

**Pros:**
- Separates compute (brokers) from storage (BookKeeper), enabling independent scaling.
- Native multi-tenancy with per-tenant isolation.
- Built-in schema registry with automatic schema evolution enforcement.
- Tiered storage automatically offloads cold data to object storage (S3), reducing operational cost.
- Geo-replication is a first-class feature, simplifying multi-datacenter deployment.

**Cons:**
- **Operational complexity:** Pulsar requires managing three component types (brokers, BookKeeper, ZooKeeper) compared to Kafka's two (brokers, ZooKeeper — or KRaft mode with zero external dependencies).
- **Ecosystem maturity:** Pulsar's connector ecosystem and tooling are less mature than Kafka's. Several connectors we need (PostgreSQL CDC, Elasticsearch sink) are community-maintained with irregular release cadences.
- **Team expertise:** No team members have production Pulsar experience. Kafka experience exists across 4 of 6 backend engineers.
- **Community size:** Pulsar's community is approximately 1/10th the size of Kafka's, making it harder to find answers to operational questions and hire experienced engineers.

**Verdict:** Architecturally compelling, especially the compute-storage separation and geo-replication. However, the operational complexity, ecosystem immaturity, and team expertise gap present unacceptable risk for a critical infrastructure migration.

{~~## Short-term Migration~>## Migration Plan~~}[^ct-1.1]

The migration will proceed in weekly phases to minimize risk and enable rollback at any checkpoint.

### Week 1: Infrastructure Provisioning

- Deploy 3-broker Kafka cluster on dedicated EC2 instances (r6i.2xlarge) using Ansible playbooks.
- Configure ZooKeeper ensemble (3 nodes) or evaluate KRaft mode if Kafka 3.7+ is stable.
- Deploy Schema Registry (Confluent Community Edition) for Avro schema management.
- Create initial topics with partition counts per the topic design table.
- Configure monitoring: JMX metrics exported to Prometheus, Grafana dashboards for broker health, consumer lag, and partition distribution.

### Week 2: Producer Integration

- Implement Kafka producer in the Order Service with the following configuration:
  - `acks=all` (wait for all in-sync replicas)
  - `enable.idempotence=true` (exactly-once producer semantics)
  - `max.in.flight.requests.per.connection=5` (maintain ordering with idempotence)
- Deploy producer behind feature flag `kafka-producer-orders`.
- Dual-write to both PostgreSQL job queue and Kafka for the `order.events` topic.
- Validate message delivery by comparing PostgreSQL row count with Kafka topic offset.

### Week 3: Consumer Integration

- Implement Kafka consumer for the Notification Service as the first consumer group.
- Deploy consumer behind feature flag `kafka-consumer-notifications`.
- Run shadow mode: consume from Kafka but do not act on messages. Compare with PostgreSQL-sourced notifications for consistency.
- Implement consumer lag alerting: warn at 10,000 messages lag, page at 50,000.

### Week 4: Validation and Cutover Preparation

- Enable Kafka consumer for Notification Service in production (disable PostgreSQL consumer).
- Monitor for 7 days: message delivery rate, processing latency, error rate, consumer lag.
- Prepare runbook for emergency rollback to PostgreSQL job queue.
- Document operational procedures: topic creation, partition increase, consumer group reset, dead letter investigation.

{++### Extended Rollout (Weeks 5-12)++}[^ct-1.2]
{--## Long-term Migration--}[^ct-1.3]

### Week 5-6: Remaining Consumers

- Migrate Inventory Service consumer to Kafka (`inventory-service.order-updates` group).
- Migrate Analytics Pipeline consumer to Kafka (`analytics-pipeline.order-metrics` group).
- Migrate Billing Service consumer to Kafka (`billing-service.order-charges` group).
- Each migration follows the same shadow-then-cutover pattern from Week 3-4.

### Week 7-8: Remaining Producers

- Migrate Payment Service producer to Kafka (`payment.events` topic).
- Migrate Inventory Service producer to Kafka (`inventory.events` topic).
- Migrate User Service producer to Kafka (`user.events` topic).
- All producers use the same dual-write pattern from Week 2.

### Week 9-10: PostgreSQL Job Queue Decommission

- Disable all PostgreSQL job queue writers (feature flags off).
- Monitor for 14 days to confirm no messages are being written to the `events` table.
- Archive the `events` table to cold storage (S3 export).
- Remove `pg_notify` triggers and polling infrastructure.
- Update service deployment manifests to remove PostgreSQL job queue connection strings.

### Week 11-12: Advanced Features

- Deploy Kafka Connect with PostgreSQL CDC connector for change data capture from legacy tables.
- Implement Schema Registry enforcement: all producers must register Avro schemas before publishing.
- Enable tiered storage for topics with retention > 30 days (offload to S3).
- Conduct chaos engineering tests: broker failure, network partition, consumer crash during rebalance.
- Final documentation update and team knowledge transfer sessions.

As noted in the migration phases {~~below~>above~~}[^ct-1.4], each phase includes explicit rollback procedures to minimize risk during the transition.

## Consequences

### Positive

- **10x throughput headroom:** Kafka's architecture supports millions of events/second, far exceeding our 200,000/minute target and providing years of growth capacity.
- **Decoupled services:** Producers and consumers are fully decoupled through topics. Adding a new consumer requires zero changes to producers — it simply joins a new consumer group.
- **Event replay:** 30-day retention enables debugging production issues by replaying the exact event sequence. New services can bootstrap from historical data without special ETL pipelines (see Decision section for details on consumer group offset management).
- **Operational maturity:** Kafka has extensive monitoring, alerting, and operational tooling. The team's existing Kafka experience (see Decision section) reduces ramp-up time.
- **Schema evolution:** Schema Registry enforces backward compatibility, preventing breaking changes. Producers and consumers can evolve independently (see Schema Registry in the migration plan above for enforcement timeline).

### Negative

- **Operational overhead:** Running a Kafka cluster requires dedicated infrastructure, monitoring, and on-call expertise. Estimated operational cost: 0.5 FTE for ongoing maintenance.
- **Learning curve:** 2 of 6 backend engineers have no Kafka experience. Budget 2 weeks of training and pair programming during the migration.
- **Infrastructure cost:** Estimated $2,400/month for the 3-broker cluster, ZooKeeper, Schema Registry, and monitoring infrastructure. This is partially offset by decommissioning the oversized PostgreSQL instance currently dedicated to the job queue ($1,100/month).
- **Complexity budget:** Kafka introduces partition management, consumer group coordination, and schema registry management. The team must develop operational playbooks and runbooks before the migration (see Decision section for error handling strategy).
- **Migration risk:** The 12-week migration involves dual-write periods and feature flag coordination across 7 services. Careful sequencing and rollback procedures are essential to avoid data loss or service disruption.


[^ct-1.1]: @ai:gpt-5.3-codex | 2026-02-27 | sub | proposed
    @ai:gpt-5.3-codex 2026-02-27: merge migration phases under one heading

[^ct-1.2]: @ai:gpt-5.3-codex | 2026-02-27 | ins | proposed
    @ai:gpt-5.3-codex 2026-02-27: retain long-term phase intent as subsection

[^ct-1.3]: @ai:gpt-5.3-codex | 2026-02-27 | del | proposed
    @ai:gpt-5.3-codex 2026-02-27: remove duplicate top-level heading after merge

[^ct-1.4]: @ai:gpt-5.3-codex | 2026-02-27 | sub | proposed
    @ai:gpt-5.3-codex 2026-02-27: cross-reference direction corrected after section merge

[^ct-1]: @ai:gpt-5.3-codex | 2026-02-27 | group | proposed
    @ai:gpt-5.3-codex 2026-02-27: propose_batch

[^ct-2.1]: @ai:gpt-5.3-codex | 2026-02-27 | sub | proposed
    @ai:gpt-5.3-codex 2026-02-27: style normalization

[^ct-2]: @ai:gpt-5.3-codex | 2026-02-27 | group | proposed
    @ai:gpt-5.3-codex 2026-02-27: propose_batch