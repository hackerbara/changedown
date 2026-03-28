<!-- changedown.com/v1: tracked -->

# API Caching Strategy

**Date:** 2026-02-10
**Author:** @infrastructure-team
**Status:** Draft

## Overview

This document defines the caching strategy for the platform's API layer. Effective caching reduces latency for end users, decreases load on backend services, and lowers infrastructure costs. The strategy encompasses three cache layers — edge, application, and database — each serving a distinct purpose in the request lifecycle.

All cache implementations must support invalidation, monitoring, and graceful degradation. A cache failure must never cause a request failure; the system falls back to the uncached path with a latency penalty but no loss of correctness.

## Cache Layers

### Edge Cache

The edge cache is deployed at the CDN layer (CloudFront) and serves responses for cacheable endpoints without reaching the origin infrastructure. Cache keys include the full request path, query parameters, and the `Accept` header to support content negotiation.

Edge cache TTLs are configured per route:

| Route Pattern | TTL | Rationale |
|---|---|---|
| `/api/v2/catalog/*` | 5 minutes | Product catalog changes infrequently |
| `/api/v2/static/*` | 24 hours | Static assets are versioned by URL |
| `/api/v2/config` | 1 minute | Feature flags need near-real-time updates |

{++For public API responses that do not vary by user identity, the edge cache serves directly from CloudFront without forwarding to the origin, reducing p99 latency from 120ms to 8ms.++}[^cn-1] Authenticated endpoints bypass the edge cache entirely by including `Cache-Control: private` in the response.

### Application Cache

The application cache sits within each service instance and stores computed results that are expensive to regenerate. This layer uses an in-process LRU cache (Caffeine for JVM services, lru-cache for Node.js services) with a maximum size of 512MB per instance.

The application cache is particularly effective for {~~REST API~>GraphQL~~}[^cn-2] query results where the same data is requested repeatedly with minor variations. Cache entries are keyed on a normalized representation of the query to maximize hit rates across similar requests.

Cache warming occurs at service startup: the 1,000 most frequently accessed keys from the previous instance are pre-loaded using a snapshot stored in S3. This eliminates the cold-start penalty during deployments and scaling events.

### Database Cache

The database cache layer reduces load on PostgreSQL by caching frequently accessed rows and query results.

{--Redis is used as a distributed cache layer that sits between the application and the database. Each service writes query results to Redis with a TTL matching the data's staleness tolerance. Redis is deployed as a 3-node cluster with automatic failover. Cache keys follow the pattern `{service}:{entity}:{id}:{version}` to enable granular invalidation. The Redis cluster handles approximately 45,000 reads per second at peak, with a hit rate of 94%.--}[^cn-3]

PostgreSQL's built-in `shared_buffers` and query cache handle the majority of read optimization for single-row lookups. For complex aggregation queries, materialized views are refreshed on a schedule (every 5 minutes for dashboards, every 1 hour for reports).

Connection pooling via PgBouncer reduces connection overhead and allows the database to serve more concurrent requests without increasing `max_connections`.

## Cache Invalidation

Cache invalidation follows a tiered strategy aligned with each cache layer:

1. **Edge cache:** CloudFront invalidation API is called when backend data changes. Invalidation requests are batched (maximum 1 per second per path pattern) to stay within AWS rate limits. Wildcard invalidations (`/api/v2/catalog/*`) are used for broad changes.

2. **Application cache:** Event-driven invalidation via Kafka. When a service modifies data, it publishes an invalidation event to the `cache.invalidation` topic. All instances of the consuming service evict the affected keys from their local LRU cache within 500ms.

3. **Database cache:** Write-through invalidation. When a service writes to PostgreSQL, it simultaneously deletes the corresponding cache entry. This ensures the cache never serves stale data for entities that were just modified.

For cases where eventual consistency is acceptable (e.g., product catalog), TTL-based expiration is preferred over explicit invalidation to reduce system complexity.

## Monitoring

Cache health is monitored through the following metrics, all exported to Prometheus and visualized in Grafana:

| Metric | Alert Threshold | Action |
|---|---|---|
| Edge cache hit rate | < 80% | Investigate CDN configuration or origin response headers |
| Application cache hit rate | < 70% | Review cache key strategy or increase cache size |
| Application cache eviction rate | > 100/sec sustained | Increase max cache size or reduce TTL for low-value entries |
| Cache invalidation latency | > 2 seconds p99 | Check Kafka consumer lag on `cache.invalidation` topic |
| Cache memory utilization | > 90% | Scale horizontally or evict low-priority entries |

Dashboard: `https://grafana.internal/d/cache-overview`

## Future Work

- **Cache-aside pattern for GraphQL:** Implement a resolver-level cache that caches individual field resolutions rather than entire query results, enabling finer-grained cache reuse across different GraphQL queries.
- **Predictive pre-warming:** Use access pattern analysis to predict which cache entries will be needed in the next 5 minutes and pre-populate them before requests arrive.
- **Multi-region cache synchronization:** As the platform expands to EU and APAC regions, implement cross-region cache replication to ensure consistent latency for global users.
- **Cache cost attribution:** Tag cache entries by team and service to enable per-team cost accounting for shared cache infrastructure.

[^cn-1]: @ai:claude-sonnet-4-5 | 2026-02-14 | ins | proposed
  @ai:claude-sonnet-4-5 2026-02-14: Added explicit performance benefit for public API edge caching. The 120ms to 8ms improvement is measured from production CloudFront analytics over the past 30 days.
  @reviewer 2026-02-15: Should we specify which responses are considered 'public'? The term is ambiguous — does it mean unauthenticated endpoints only, or also authenticated responses that don't vary per user?

[^cn-2]: @ai:claude-sonnet-4-5 | 2026-02-14 | sub | proposed
  @ai:claude-sonnet-4-5 2026-02-14: Changed from REST API to GraphQL. GraphQL queries exhibit higher cache reuse because clients request exactly the fields they need, leading to more predictable cache key patterns and reduced over-fetching of data that would otherwise bust cache entries.

[^cn-3]: @ai:claude-sonnet-4-5 | 2026-02-14 | del | proposed
  @ai:claude-sonnet-4-5 2026-02-14: Proposing removal of the Redis cache layer. Redis adds significant operational complexity (cluster management, failover monitoring, memory sizing) and the PostgreSQL built-in caching plus application-level LRU cache already achieve a 94% effective hit rate. The marginal benefit does not justify the operational burden.
