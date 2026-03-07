
# Observability Platform Design

**Version:** 0.9
**Date:** 2026-02-18
**Author:** @human:sarah
**Status:** Draft
**Last Review:** 2026-02-22

## 1. Overview

The observability platform consolidates metrics, logs, and traces into a unified system that supports real-time alerting, historical analysis, and capacity planning. It replaces the current fragmented setup where metrics live in Prometheus, logs in Elasticsearch, and traces in Jaeger with no correlation between the three.

The platform is built on the OpenTelemetry Collector (OTel Collector) as the unified ingestion layer. All services emit telemetry using the OpenTelemetry SDK, which exports to the collector via gRPC. The collector handles routing, sampling, and enrichment before forwarding data to the appropriate storage backend.

## 2. Data Pipeline

### 2.1 Ingestion

Services instrument their code using the OpenTelemetry SDK. The SDK supports automatic instrumentation for common frameworks (Express, Spring Boot, Django) and manual instrumentation for custom business logic.

Telemetry data is exported from the SDK to the collector using the OTLP protocol over gRPC on port 4317. The collector runs as a sidecar container in each application pod, providing isolation and per-service resource limits.

Each collector instance performs:

- **Batching:** Aggregates spans and metrics into batches of 1000 items or 5-second windows
- **Enrichment:** Adds Kubernetes metadata (pod name, namespace, node) and deployment metadata (version, commit SHA)
- **Sampling:** Applies tail-based sampling for traces — all error traces are kept, successful traces are sampled at 10%
- **Routing:** Sends metrics to Mimir, logs to Loki, and traces to Tempo

### 2.2 Storage

| Signal | Backend | Retention | Compression |
|---|---|---|---|
| Metrics | Grafana Mimir | 13 months | Gorilla + LZ4 |
| Logs | Grafana Loki | 30 days (hot) + 90 days (cold) | Snappy |
| Traces | Grafana Tempo | 14 days (hot) + 30 days (cold) | zstd |

All storage backends use S3-compatible object storage (MinIO) for long-term retention. Hot data is cached on local NVMe SSDs for fast query performance. Cold data is accessed on-demand with a query latency SLA of under 30 seconds.

### 2.3 Query Layer

Grafana serves as the unified query interface. Users access all three signal types through a single dashboard with correlated views:

- Click on a metric spike to see logs from the same time window and service
- Click on an error log to see the distributed trace that generated it
- Click on a slow trace span to see the corresponding service's metrics during that period

Query performance targets: P50 under 500ms, P99 under 5 seconds for queries spanning up to 24 hours of data. Queries spanning more than 24 hours are routed to a dedicated long-range query pool with relaxed latency targets (P99 under 30 seconds).

## 3. Alerting

### 3.1 Alert Rules

Alert rules are defined in YAML and stored in a Git repository. Changes to alert rules require pull request review from the on-call team. The alert manager evaluates rules every 15 seconds.

| Severity | Response Time | Notification | Escalation |
|---|---|---|---|
| Critical | Immediate | PagerDuty + Slack | Auto-escalate after 15 min |
| Warning | 30 minutes | Slack only | Manual escalation |
| Info | Next business day | Email digest | None |

### 3.2 Alert Routing

Alerts are routed based on service ownership labels. Each service declares its owning team in its Kubernetes deployment manifest via the `team` label. The alert manager uses this label to route notifications to the correct Slack channel and PagerDuty service.

Silences and inhibition rules are managed through the Grafana UI and require authentication via SSO. Silences are limited to a maximum of 4 hours. Extending a silence requires creating a new silence with a linked incident ticket.

## 4. Service Level Objectives

### 4.1 SLO Framework

Each service defines SLOs using the following template:

```yaml
slo:
  name: "payment-api-availability"
  target: 99.95
  window: 30d
  indicator:
    type: availability
    good_events: "http_requests_total{status!~'5..'}"
    total_events: "http_requests_total"
```

The platform calculates error budgets in real time. When a service has consumed more than 80% of its monthly error budget, it automatically enters a "reliability mode" where only bug fixes and reliability improvements can be deployed — feature deployments are blocked.

### 4.2 Burn Rate Alerts

Burn rate alerts detect when error budget consumption is accelerating beyond the sustainable rate. The platform generates two tiers of burn rate alerts:

- **Fast burn (14.4x):** Consuming the 30-day budget in 2 days. Triggers Critical alert.
- **Slow burn (3x):** Consuming the 30-day budget in 10 days. Triggers Warning alert.

Both alerts require a sustained violation over two evaluation windows (5 minutes for fast burn, 30 minutes for slow burn) to avoid alerting on transient spikes.

## 5. Capacity Planning

The platform ingests approximately:

- **Metrics:** 2 million active series, 50K samples/second
- **Logs:** 500 GB/day compressed, 3 TB/day uncompressed
- **Traces:** 100K spans/second, 200 GB/day compressed

Storage growth is projected at 15% per quarter based on the current trajectory of new service onboarding. The capacity planning dashboard shows projected storage exhaustion dates and triggers alerts when runway drops below 90 days.

## 6. Access Control

Dashboard access follows a role-based model:

| Role | Permissions |
|---|---|
| Viewer | Read-only access to dashboards and explore |
| Editor | Create and modify dashboards, create silences |
| Admin | Manage data sources, alert rules, and user roles |
| Super Admin | Platform configuration, retention policies |

All access is authenticated via corporate SSO (Okta). Grafana syncs team membership from Okta groups every 5 minutes. Deprovisioned users lose access immediately upon Okta account deactivation.
