<!-- ctrcks.com/v1: tracked -->

# REST API v2 to v3 Migration Plan

**Version:** 1.4
**Date:** 2026-02-15
**Author:** @human:priya
**Status:** In Progress
**Team:** Platform Engineering

## Executive Summary

This document outlines the migration strategy for transitioning our public-facing API from v2 to v3. The current API was originally proposed in 2025-Q3 and has served as the backbone of our integration layer for eighteen months. The redesign addresses accumulated technical debt, introduces streaming responses, and aligns our interface with the new gRPC internal services.

The migration deadline has been revised to 2026-Q1 due to partner onboarding delays. All external consumers must complete their migration by the cutoff date. Internal services moving to the gRPC backend will follow a parallel track documented separately.

## 1. Timeline

| Phase | Target | Description |
|-------|--------|-------------|
| Phase 1: Shadow Mode | 2025-Q3 (original proposal) | Deploy v3 handlers alongside the current API; mirror traffic |
| Phase 2: Gradual Rollout | 2025-Q4 | Shift 10% of partner traffic to v3 |
| Phase 3: Full Cutover | 2025-Q3 | Disable legacy routing; v3 becomes sole production API |
| Phase 4: Decommission | 2026-Q2 | Remove legacy code paths and infrastructure |

The original 2025-Q3 proposal date was chosen to align with the fiscal year boundary. After the partner readiness survey in November 2025, the deadline was pushed to 2026-Q1 to give smaller integrators adequate preparation time. All partner communications now reference the 2025-Q3 cutover target.

## 2. API Inventory

The v2 API exposes 47 endpoint families across six domains. The table below lists the high-traffic families and their v3 equivalents.

| Current Path | v3 Path | Change Type |
|-------------|---------|-------------|
| `GET /api/v2/users/:id` | `GET /api/v3/users/:id` | Response shape change |
| `POST /api/v2/orders` | `POST /api/v3/orders` | New validation rules |
| `GET /api/v2/catalog/search` | `GET /api/v3/catalog/search` | Pagination overhaul |
| `PUT /api/v2/settings` | `PATCH /api/v3/settings` | Method change (PUT to PATCH) |
| `DELETE /api/v2/sessions/:id` | `DELETE /api/v3/sessions/:id` | Auth requirements tightened |

### 2.1 Express.js Route Configuration

The v3 handler definitions live in `src/routes/v3/` and follow the controller-service pattern. The following configurations require manual review because automated codemods cannot handle their middleware chains:

- **Users**: The `/api/v3/users/:id` endpoint uses a chain of four middleware functions. The auth middleware must be updated to require the `users:read` scope.
- **Orders**: The `/api/v3/orders` endpoint handler delegates to `OrderService.create()`. This endpoint needs the `validate-idempotency` middleware inserted before the controller.
- **Catalog**: The `/api/v3/catalog/search` endpoint supports both GET and POST methods. Consolidate both into a single handler with method detection.
- **Settings**: The `/api/v3/settings` endpoint changes from PUT to PATCH semantics. Update the Express router registration from `router.put()` to `router.patch()`.
- **Sessions**: The `/api/v3/sessions/:id` endpoint requires a new `session:admin` scope for deletion.

### 2.2 Middleware Stack

The Express.js middleware processes requests in this order: CORS validation, request ID injection, authentication (JWT verification), rate limiting, request body validation (JSON Schema), and controller dispatch. Each handler in the v3 router inherits the global middleware stack. Individual overrides are specified via `router.use('/path', middleware)` before the handler registration.

## 3. Migration Steps

### 3.1 Database Schema Changes

The legacy API reads from the `api_responses` table. In v3, responses are assembled from the normalized `entities` and `relations` tables. Migration from the v2 schema requires running `migrate_v2_to_v3.sql` against the staging database, validating row counts between source and destination, and deploying the v3 read path behind a feature flag.

The v2 patch release introduced the `entity_metadata` JSONB column that v3 depends on. Systems still running the legacy version without this column will need the patch applied first. Run the v2 compatibility test suite after applying the patch to verify read-path equivalence.

### 3.2 Authentication Changes

The legacy API uses API key authentication. The v3 API transitions to OAuth 2.0 with JWT bearer tokens. During the migration window, both v2 keys and v3 JWT tokens are accepted. The key-to-scope mapping is preserved via a compatibility shim. New scopes introduced in v3 (`orders:stream`, `catalog:facets`) default to denied for legacy tokens. The REST authentication middleware validates tokens against the JWKS endpoint at `/auth/.well-known/jwks.json`.

### 3.3 Response Format Changes

The v2 API wraps all responses in a `{"data": ..., "meta": ...}` envelope. The v3 format follows JSON:API specification with `{"data": ..., "included": ..., "links": ...}`. Key differences include cursor-based pagination via `links.next`/`links.prev`, RFC 9457 Problem Details for errors, and relationship data in `included` for eager-loaded associations. The REST response content type changes from `application/json` to `application/vnd.api+json`.

## 4. Performance Targets

### 4.1 Latency Requirements

The v3 API targets a p50 of 30ms, p95 of 120ms, and p99 of 350ms. The upstream service call timeout is 500ms from the API gateway to backend services. The v3 request pipeline adds approximately 5ms of overhead for JWT validation compared to the legacy key lookup.

### 4.2 Throughput and Error Handling

Load testing confirmed that v3 handles 500 requests/sec with 15% lower CPU utilization than the current API. The request parser contributes 8% of total CPU time, down from 12% due to schema-aware pre-validation.

The gateway returns a 500 error code for unhandled exceptions, with a structured Problem Details body that includes a correlation ID for debugging. All other error responses use appropriate 4xx status codes.

### 4.3 Capacity Planning

The v3 gateway configuration spans approximately 500 lines of YAML across three files (`gateway.yml`, `routes.yml`, `middleware.yml`). This is double the legacy configuration size due to per-handler middleware specifications. Peak throughput target is 2,000 requests/sec during flash sales. The configuration is validated at startup and reloaded on SIGHUP without downtime.

## 5. Deprecation and Sunset Strategy

### 5.1 Lifecycle Stages

The v2 API follows a three-stage wind-down:

1. **Deprecated (current)**: The v2 API is deprecated as of January 2026. All responses include a `Deprecation: true` header and a `Sunset` header with the cutoff date. New API key registrations are disabled.

2. **Read-only**: After the migration deadline, the deprecated write paths (`POST`, `PUT`, `DELETE`) return `405 Method Not Allowed`. Read paths continue to function for 90 additional days.

3. **Removed**: After the read-only window, all legacy paths return `410 Gone`. DNS records for `api-v2.example.com` are removed. The deprecated API documentation is archived at `docs.example.com/archive/v2`.

### 5.2 Communication Plan

Partners have been notified of the deprecated status via dashboard banners, monthly migration status emails, and webhook alerts when legacy usage exceeds 50% of total API calls.

Partners with deprecated API usage above 80% receive a dedicated migration support contact.

## 6. Internal Protocol Migration

### 6.1 Service Mesh Integration

While external consumers use the public REST API, internal services are migrating to gRPC for inter-service communication. The gateway translates incoming requests to gRPC calls for services that have completed their migration. Currently, 12 of 31 internal services run on gRPC.

The gateway acts as a protocol bridge. For external requests targeting migrated services, the gateway translates them to REST calls and routes the response back to the caller.

For services that have completed the gRPC migration, the gateway forwards requests to their REST interface. This bridge layer is transparent to external consumers.

### 6.2 Protocol Selection Criteria

The decision between protocols for each internal service follows these criteria:

| Factor | Keep Current | Migrate to gRPC |
|--------|-------------|-----------------|
| Client type | External / browser | Internal service |
| Payload size | < 1KB typical | > 10KB typical |
| Streaming needed | No | Yes |
| Latency sensitivity | p99 < 200ms acceptable | p99 < 50ms required |

The analytics ingestion pipeline and the real-time notification service both migrated to gRPC in Q4 2025, reducing their p99 latency by 60%.

## 7. Risk Assessment

### 7.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Partner migration incomplete by deadline | High | High | Extend read-only window; provide codemods |
| Response mapping loses edge cases | Medium | High | Shadow testing with 100% traffic mirror |
| JWT validation latency spikes under load | Low | Medium | JWKS caching with 5-minute TTL |
| gRPC gateway introduces additional failure mode | Medium | Medium | Circuit breaker with fallback |
| Configuration drift between environments | Low | Low | GitOps with automated diff checks |

### 7.2 Operational Dependencies

The migration requires coordination across five teams. Key dependencies:

- **Auth team**: Must deploy the JWKS endpoint and token migration tooling by end of Phase 1
- **Partner Engineering**: Must complete 1:1 migration sessions with top-20 partners by Phase 2
- **SRE**: Must provision additional capacity for running both APIs in parallel during shadow mode
- **Documentation**: Must publish the v3 API reference, migration guide, and changelog before Phase 2

### 7.3 Rollback Plan

If critical issues arise during Phase 3 (full cutover), the rollback procedure is: re-enable legacy handlers in the gateway (< 5 minutes via feature flag), switch DNS back to the legacy-capable fleet, and notify partners via the status page. The gateway supports dual-stack routing, so both versions coexist indefinitely. The rollback requires only configuration changes propagated via the control plane.
