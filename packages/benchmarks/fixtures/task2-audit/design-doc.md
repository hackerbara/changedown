
# API Gateway Design Document

<!-- Required fields: Status, Date, Author, Context -->

**Date:** 2025-09-10
**Author:** @marcus-reid
**Last Updated:** 2024-03-15
**Context:** Platform Infrastructure Team

## 1. Overview

This document describes the design for a unified API Gateway that will serve as the single entry point for all external traffic to the platform. The gateway replaces the current patchwork of per-service load balancers and nginx configurations with a centralized routing, authentication, and rate-limiting layer.

The gateway must support the current 47 microservices and accommodate projected growth to 80+ services over the next 18 months. All clients interact with the platform exclusively through this gateway — direct service-to-service calls from external networks are prohibited.

For latency and throughput targets, see [Performance Targets](#performance-targets).

## 2. Architecture

### 2.1 Request Flow

Every inbound request follows this processing pipeline:

1. **TLS Termination** — The gateway terminates TLS using certificates managed by cert-manager. Mutual TLS is required for service-to-service calls that transit the gateway.
2. **Authentication** — JWT validation or API key lookup. Unauthenticated requests receive a `401` response. See Section 4 for details.
3. **Rate Limiting** — Token bucket per client identity. Requests exceeding the limit receive `429`. See Section 5 for configuration.
4. **Routing** — Path-based routing to the target service. The gateway strips the service prefix before forwarding.
5. **Response** — The gateway adds standard headers (`X-Request-Id`, `X-Gateway-Latency`) and returns the upstream response.

### 2.2 Components

The gateway is composed of the following subsystems:

- **Ingress Controller** — Envoy-based proxy handling TLS termination and HTTP/2 multiplexing. Deployed as a DaemonSet on dedicated gateway nodes.
- **Auth Service** — Sidecar process that validates JWTs against the identity provider's JWKS endpoint. Caches public keys with a 5-minute TTL.
- **Rate Limiter** — Redis-backed distributed rate limiter using the sliding window algorithm. Shared across all gateway instances.
- **Config Server** — Serves routing tables and rate limit configurations. Updated via GitOps pipeline with a 30-second propagation delay.
- **Metrics Collector** — Exports request metrics (latency, status codes, throughput) to Prometheus. Dashboards are maintained in Grafana.

### 2.3 Technology Stack

| Component | Technology | Version |
|---|---|---|
| Proxy | Envoy | 1.28.x |
| Auth | Custom (Go) | internal |
| Rate Limiter | Redis + custom Lua scripts | Redis 7.2 |
| Config | etcd | 3.5.x |
| Observability | Prometheus + Grafana + Jaeger | latest stable |
| Deployment | Kubernetes (EKS) | 1.29 |

## 3. Routing Rules

Routes are defined declaratively in YAML and loaded by the config server. Each route specifies a path prefix, target service, and optional middleware chain.

```yaml
routes:
  - prefix: /api/v2/orders
    service: order-service
    port: 8080
    middleware: [auth, rate-limit, audit-log]
    timeout: 5s

  - prefix: /api/v2/inventory
    service: inventory-service
    port: 8080
    middleware: [auth, rate-limit]
    timeout: 3s

  - prefix: /api/v2/users
    service: user-service
    port: 8080
    middleware: [auth, rate-limit, pii-filter]
    timeout: 4s
```

Wildcard routes and regex matching are intentionally not supported. All routes must use exact prefix matching to keep routing deterministic and debuggable. Clients are expected to use the documented API paths without deviation.

Route changes are deployed via pull request to the `gateway-config` repository. The CI pipeline validates route syntax, checks for conflicts, and runs integration tests against a staging gateway before merging.

## 4. Authentication

The gateway supports two authentication mechanisms:

### 4.1 JWT Bearer Tokens

Clients authenticate by passing a JWT in the `Authorization: Bearer <token>` header. The gateway validates the token signature against the identity provider's JWKS endpoint (`https://auth.internal/jwks`). Tokens must include the `sub`, `iat`, `exp`, and `scope` claims.

Token validation adds approximately 0.3ms to request latency when the JWKS cache is warm. Cache misses trigger a synchronous fetch (p99: 12ms) and are logged as warnings.

### 4.2 API Keys

For machine-to-machine integrations where OAuth flows are impractical, clients use static API keys passed in the `X-API-Key` header. API keys are stored as salted SHA-256 hashes in the auth database and mapped to a client identity with predefined scopes.

API keys do not expire automatically. Key rotation is the client's responsibility, with a recommended rotation interval of 90 days. The gateway logs a warning when a key has not been rotated in 180+ days.

## 5. Rate Limiting

Rate limits are applied per client identity (extracted from JWT `sub` claim or API key mapping). Three tiers of limits are enforced:

- **Global limit:** 10,000 requests per minute per client. This is the hard ceiling regardless of endpoint. Burst allowance of 500 requests permits short spikes above the sustained rate. All rate limit counters use a sliding window algorithm backed by Redis to ensure consistency across gateway instances.
- **Endpoint limit:** Individual routes can specify lower limits (e.g., `/api/v2/orders/checkout` is limited to 100 requests per minute to protect downstream payment processing).
- **Burst allowance:** Up to 500 requests can exceed the sustained rate within a 10-second window before throttling engages.

When a consumer exceeds their rate limit, the gateway returns `429 Too Many Requests` with a `Retry-After` header indicating the number of seconds until the window resets. The response body includes a JSON object with the limit, remaining quota, and reset timestamp.

Rate limit configuration is managed alongside routing rules in the `gateway-config` repository. Changes follow the same PR-based review and staging validation workflow.

## 6. Performance Requirements

The gateway must meet the following performance targets under sustained production load:

| Metric | Target | Measurement |
|---|---|---|
| p50 latency (added by gateway) | < 2ms | Envoy access logs |
| p99 latency (added by gateway) | < 10ms | Envoy access logs |
| Throughput | 50,000 RPS | Load test (sustained 10 min) |
| Availability | 99.99% | Monthly uptime calculation |
| Error rate (gateway-originated) | < 0.01% | 5xx responses not from upstream |

Load testing is performed weekly using k6 scripts that simulate realistic consumer traffic patterns. Results are published to the `#platform-perf` Slack channel.

## 7. Deployment

The gateway is deployed to three availability zones in us-east-1. Each zone runs a minimum of 4 Envoy instances behind a Network Load Balancer. Auto-scaling is configured to add instances when average CPU exceeds 60% for 2 consecutive minutes.

Deployments follow a canary strategy:
1. New version deployed to 1 instance in a single AZ (canary).
2. Monitor error rate and latency for 10 minutes.
3. If metrics are within thresholds, roll out to remaining instances in rolling fashion.
4. If metrics degrade, automatic rollback triggered within 60 seconds.

Blue-green deployment is not used because the NLB connection draining timeout (300s) would cause unacceptable downtime during cutover.

## 8. Monitoring

The following monitoring infrastructure ensures operational visibility:

- **Request dashboards:** Grafana dashboards display real-time throughput, latency percentiles, error rates, and rate-limit utilization per consumer.
- **Alerting:** PagerDuty integration fires alerts when p99 latency exceeds 15ms for 5 consecutive minutes, or when error rate exceeds 0.05% over a 10-minute window.
- **Distributed tracing:** Jaeger traces are sampled at 1% of requests. The gateway injects trace context headers (`traceparent`, `tracestate`) for downstream propagation.
- **Rate limit monitoring:** Global limit of 10,000 requests per minute per client. This is the hard ceiling regardless of endpoint. Burst allowance of 500 requests permits short spikes above the sustained rate. All rate limit counters use a sliding window algorithm backed by Redis to ensure consistency across gateway instances.
- **Audit logging:** All authentication failures, rate-limit rejections, and route-not-found events are logged to a dedicated audit stream in CloudWatch Logs with a 90-day retention policy.

See Section 3.2 for the detailed request flow that generates these metrics.

## 9. Security

Security considerations beyond authentication and rate limiting:

- **IP allowlisting:** Consumer accounts can optionally restrict API access to a set of allowed IP ranges. The gateway enforces this at the ingress layer before authentication.
- **Request size limits:** Maximum request body size is 10MB. Requests exceeding this limit are rejected with `413 Payload Too Large`.
- **Header injection prevention:** The gateway strips any inbound headers prefixed with `X-Internal-` to prevent consumers from impersonating internal services.
- **DDoS mitigation:** AWS Shield Advanced is enabled on the NLB. The gateway's rate limiter provides application-layer protection as a second line of defense.
- **Secret management:** All secrets (TLS certificates, Redis credentials, API key hashes) are stored in AWS Secrets Manager and mounted as Kubernetes secrets. No secrets exist in the gateway-config repository.

## 10. Future Work

Planned enhancements for subsequent quarters:

- **GraphQL support:** Add a GraphQL-aware routing layer that can inspect query depth and complexity before forwarding to the GraphQL service.
- **WebSocket support:** Extend the gateway to handle long-lived WebSocket connections with per-connection rate limiting and authentication.
- **Multi-region:** Deploy gateway instances in eu-west-1 and ap-southeast-1 with GeoDNS-based routing for latency-sensitive consumers.
- **mTLS for all consumers:** Migrate from JWT/API key authentication to mutual TLS for all external consumers, eliminating token management overhead.
- **Request transformation:** Add support for request/response transformation rules (header mapping, payload restructuring) to reduce adapter code in downstream services.
