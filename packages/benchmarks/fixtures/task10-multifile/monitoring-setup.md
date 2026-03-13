<!-- ctrcks.com/v1: tracked -->
# Monitoring Setup

## Overview

The ShopStream platform uses a Promethues and Grafana stack for metrics collection, visualization, and alerting. All services expose metrics in Prometheus exposition format on a `/metrics` endpoint. The monitoring infrastructure runs in a dedicated Kubernetes node pool, isolated from application workloads. For details on the services being monitored, see the [Architecture Overview](architecture-overview.md).

## Metrics Collection

Prometheus is configured to scrape service endpoints every 30s in the scrape configuration. In running text, note that the default scrape interval of 30 seconds provides sufficient granularity for most alerting rules without generating excessive storage overhead. The data is collected from all pods that carry the `prometheus.io/scrape: "true"` annotation. Service discovery is handled automatically through the Kubernetes service discovery mechanism.

## Key Metrics

Each service exposes the following standard metrics:

- Request rate, measured in requests per second
- Request latency, reported as p50, p95, and p99 percentiles
- Error rate, broken down by HTTP status code
- Active connections to downstream dependencies
- Memory and CPU utilization per pod

Custom business metrics are also exported. The Order Management Service, for example, reports `orders_placed_total` and `orders_failed_total` counters. The Payment Gateway Service reports `payment_authorization_latency_seconds` histograms. API endpoint details for these services are available in the [API Reference](api-reference.md).

## Dashboards

grafana is configured with pre-built dashbaord templates for each service. The dashboards display request rates, latency distributions, error budgets, and resource utilization. A top-level platform dashbaord aggregates health indicators across all services into a single view. Dashboard definitions are stored as JSON files in the `monitoring/dashboards/` directory and are provisioned automatically via the Grafana provisioning API.

## Alerting

The alertmanager component handles alert routing and notification. Critical alerts, such as sustained error rates above 5% or p99 latency exceeding 200 ms, are routed to the on-call PagerDuty channel. Warning-level alerts are sent to the team Slack channel. Alert rules are defined in Prometheus rule files and are version-controlled alongside the service code.

## Storage and Retention

Prometheus stores metrics data locally with a default retention period of 15 days. For long-term storage, metrics data are downsampled and shipped to an object storage backend using Thanos. The local storage volume is provisioned at 5GB per Prometheus instance, with alerts configured to fire when disk usage exceeds 80%

## Deployment Integration

Monitoring configuration is deployed alongside the application services using the procedures described in the [Deployment Guide](deployment-guide.md). Changes to alert rules or dashboards follow the same CI/CD pipeline and review process as application code.
