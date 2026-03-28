<!-- changedown.com/v1: tracked -->
# PaymentFlow API Design Document

**Version:** {~~1.0~>2.1~~}[^cn-1]
**Last Updated:** {~~2026-02-01~>2026-02-15~~}[^cn-2]
**Authors:** Alice Chen (Lead Engineer), Bob Martinez (Security), Carol Park (Product)
**Status:** {~~Draft~>Active Review~~}[^cn-3]
**Reviewers:** @bob, @carol, @ai:claude-opus-4.6, @ai:kimi-k2

---

## 1. Overview

PaymentFlow is a {~~payment processing service~>payment orchestration platform~~}[^cn-4] for mid-size SaaS companies{++ processing $1M–$100M in annual payment volume++}[^cn-5]. The platform abstracts multiple payment service providers (Stripe, Adyen, Braintree) behind a unified API, enabling intelligent routing, automatic failover, and consolidated reporting.

The platform serves three primary functions:

1. **Payment abstraction.** A single API surface that routes payments through the optimal PSP based on cost, success rate, geographic proximity, and real-time availability. Merchants integrate once; the platform handles PSP-specific protocols, retry logic, and reconciliation.

2. **Subscription lifecycle management.** Full billing lifecycle — trials, upgrades, downgrades, proration, dunning, pause/resume — with configurable retry behavior and customer communication triggers at each state transition.

3. **Financial operations.** Automated payouts, fee calculation, tax reporting hooks, and consolidated financial reporting across all PSPs. Real-time balance tracking with configurable payout schedules (daily, weekly, monthly, or manual).

### 1.1 Goals

1. Process payments with {~~99.9%~>99.99%~~}{>>@bob | 2026-02-03 | sub<<} reliability through multi-PSP redundancy
2. Achieve PCI DSS Level 1 compliance from day one
3. Provide developer experience {~~comparable to~>on par with~~}{>>@carol<<} Stripe's API (our benchmark)
4. Support subscription billing, one-time payments, invoicing, and marketplace payouts
5. Enable real-time payment routing based on cost, success rate, and latency
6. {++Maintain sub-100ms P95 latency for all synchronous API operations++}[^cn-34]

### 1.2 Non-Goals

- Consumer-facing checkout UI (merchants build their own)
- {~~Cryptocurrency~>Cryptocurrency or BNPL~~}{>>@carol | 2026-02-07<<} payment methods (v1 scope)
- {++Physical point-of-sale integration++}
- Tax calculation (integrate with Avalara/TaxJar)
- {++Fraud scoring (integrate with Sift/Sardine — see Section 9.4)++}[^cn-35]

### 1.3 Team & Timeline

- **Core team:** {~~3~>4~~} backend engineers, 2 frontend, 1 SRE, 1 security
- **Phase 1 launch:** {~~2026-Q2~>2026-Q3~~}[^cn-33] (core payments + subscriptions)
- **Phase 2:** 2026-Q4 (marketplace payouts + advanced routing)
- **Phase 3:** 2027-Q1 (analytics dashboard + self-service onboarding)

### 1.4 Architectural Principles

The platform is built on four architectural principles that inform every design decision in this document:

**Idempotency everywhere.** Every mutating operation accepts an idempotency key. Duplicate requests return the original response without side effects. This is non-negotiable — payment systems that aren't idempotent are payment systems that lose money.

**Eventual consistency with strong ordering.** Payment state transitions are strictly ordered per transaction. Cross-transaction queries are eventually consistent (typically <500ms propagation). Clients that need strong consistency for a specific resource can use the `X-Consistency: strong` header at a latency cost.

**Observability by default.** Every API call generates structured logs, distributed traces (OpenTelemetry), and metrics. Audit logs are a separate, immutable stream (see Section 9.3). No payment operation should ever be a black box.

**Graceful degradation.** If a PSP is down, route around it. If all PSPs are down, queue the payment and process when connectivity returns. If the queue is full, return an honest error. Never silently drop a payment.

---

## 2. Authentication{++ & Authorization++}[^cn-7]

All API access requires authentication. PaymentFlow supports {~~a single authentication mechanism~>multiple authentication mechanisms with different security profiles~~}[^cn-6] appropriate for different integration patterns.

### 2.1 OAuth 2.0 with PKCE (Primary)

All client-facing API access uses OAuth 2.0 with Authorization Code flow and PKCE (Proof Key for Code Exchange). This applies to dashboard access, merchant portals, and any application where end-user authentication is involved.

{++All flows MUST use PKCE regardless of client type — including confidential server-side clients. This eliminates the distinction between "public" and "confidential" client security models and simplifies the implementation matrix.++}[^cn-6]

**Token lifecycle:**

- Access tokens: {~~60-minute~>15-minute~~}[^cn-9] expiry, JWT format, signed with RS256
- Refresh tokens: 30-day expiry, opaque (not JWT), rotated on every use
- Token rotation: Refresh tokens are single-use; each refresh issues a new refresh token and invalidates the previous one. Concurrent refresh attempts using the same token trigger automatic revocation of the entire token family (replay detection).

**Required scopes:**

| Scope | Description | Default |
|-------|-------------|---------|
| `payments:read` | View payment details and history | Yes |
| `payments:write` | Create and modify payments | No |
| `subscriptions:manage` | Full subscription lifecycle | No |
| `refunds:create` | Issue refunds | No |
| `webhooks:manage` | Configure webhook endpoints | No |
| `accounts:admin` | Account settings and team management | No |
| {++`reports:read`++}[^cn-11] | {++Access analytics and financial reports++}[^cn-11] | {++No++}[^cn-11] |
| {++`disputes:manage`++}[^cn-11] | {++Respond to chargebacks and disputes++}[^cn-11] | {++No++}[^cn-11] |

### 2.2 API Keys (Server-to-Server)

API keys are provided for server-to-server integration where OAuth flows are impractical. Keys are environment-scoped (test/live) and support fine-grained permission sets.

**Key format:** `pk_live_` prefix for publishable keys, `sk_live_` prefix for secret keys. Keys are 32 bytes of cryptographically random data, base62-encoded.

**Key management:**

- Each account can have up to 10 active API keys per environment
- Keys can be restricted to specific IP ranges, scopes, and resource types
- Key rotation: Create new key → update integration → revoke old key. No automatic rotation; rotation is an explicit merchant action.
- All key operations require 2FA confirmation in the dashboard

{++**Deprecation notice:** API key authentication will be deprecated in favor of OAuth 2.0 client credentials flow by 2027-Q2. Existing integrations will continue to work during a 24-month sunset period. New integrations should use OAuth 2.0 client credentials for server-to-server communication.++}[^cn-8]

### 2.3 Token Management

Token management endpoints enable clients to introspect, revoke, and audit their active sessions.

**Endpoints:**

- `POST /oauth/token` — Issue or refresh tokens
- `POST /oauth/revoke` — Revoke a specific token or entire token family
- `GET /oauth/introspect` — Check token validity and scopes (RFC 7662)
- `GET /oauth/sessions` — List active sessions for the authenticated account

**Token rotation policy:**

- Access tokens: Non-rotatable (short-lived, {~~60~>15~~}[^cn-9] min)
- Refresh tokens: Rotated on every use (single-use model)
- API keys: Manual rotation via dashboard or API, with {~~24~>48~~}[^cn-9]-hour grace period for the old key
- Rotation events are logged and trigger webhook notifications

### 2.4 {++Mutual TLS (Service-to-Service)++}[^cn-10]

{++Internal service-to-service communication within the PaymentFlow platform uses mutual TLS with certificate pinning. Client certificates are issued by our internal CA with 90-day rotation and automated renewal via cert-manager.++}[^cn-10]

{++**Certificate requirements:**++}[^cn-10]

{++- RSA 2048-bit minimum (4096-bit recommended for new certificates)++}[^cn-10]
{++- SAN-based identification (no CN matching — CN is deprecated per RFC 6125)++}[^cn-10]
{++- OCSP stapling required for all certificates++}[^cn-10]
{++- Certificate transparency logging for all issued certificates++}[^cn-10]
{++- Maximum certificate lifetime: 90 days (enforced by CA policy)++}[^cn-10]

### 2.5 OpenID Connect

PaymentFlow implements OIDC discovery for dashboard and merchant portal SSO. The OIDC provider exposes standard endpoints:

- `GET /.well-known/openid-configuration` — Discovery document
- `GET /.well-known/jwks.json` — JSON Web Key Set

Custom claims include `org_id`, `role`, and `permissions` array for fine-grained authorization within the PaymentFlow dashboard. The `permissions` claim is a flat array of scope strings matching the OAuth scope definitions above.

---

## 3. Data Model

### 3.1 {~~User~>Account~~}[^cn-12.1]

The {~~User~>Account~~}[^cn-12.2] entity represents a merchant organization. All resources (payments, subscriptions, webhooks) are scoped to an {~~user~>account~~}[^cn-12.3].

```
Account {
  id: string (acc_*)
  name: string
  email: string
  status: enum (active, suspended, closed)
  created_at: timestamp
  updated_at: timestamp
  settings: AccountSettings
  metadata: map<string, string>
}

AccountSettings {
  default_currency: string (ISO 4217)
  payout_schedule: enum (daily, weekly, monthly)
  statement_descriptor: string (max 22 chars)
  auto_payout: boolean
  timezone: string (IANA timezone)
}
```

### 3.2 Transaction

Transactions are the core entity. Every payment, refund, and payout creates a Transaction record. Transactions are immutable once finalized — state transitions create new audit entries rather than mutating the record.

```
Transaction {
  id: string (txn_*)
  account_id: string (acc_*)
  amount: integer (smallest currency unit, e.g. cents)
  currency: string (ISO 4217)
  status: enum (pending, processing, succeeded, failed, refunded, disputed)
  type: enum (payment, refund, payout, transfer)
  payment_method_id: string (pm_*)
  psp_reference: string
  psp_provider: enum (stripe, adyen, braintree)
  idempotency_key: string
  created_at: timestamp
  updated_at: timestamp
  {++encrypted_at: timestamp++}[^cn-13]
  metadata: map<string, string>
  failure_reason: string (nullable)
  {--failure_code: integer--}[^cn-14]
  risk_score: float (0.0-1.0)
}
```

### 3.3 PaymentMethod

Payment methods are tokenized representations of customer payment instruments. Raw card numbers never touch PaymentFlow servers — tokenization happens at the edge via the client-side SDK.

```
PaymentMethod {
  id: string (pm_*)
  account_id: string (acc_*)
  customer_id: string (cust_*)
  type: enum (card, bank_account, wallet)
  card: CardDetails (nullable)
  bank_account: BankDetails (nullable)
  {++fingerprint: string++}[^cn-15]
  created_at: timestamp
  expires_at: timestamp (nullable)
}

CardDetails {
  brand: enum (visa, mastercard, amex, discover)
  last4: string
  exp_month: integer
  exp_year: integer
  funding: enum (credit, debit, prepaid)
  country: string (ISO 3166-1 alpha-2)
}

BankDetails {
  bank_name: string
  routing_number: string (last 4 digits only)
  account_last4: string
  account_type: enum (checking, savings)
}
```

### 3.4 Subscription

Subscriptions manage recurring billing relationships. The subscription state machine handles trials, active billing, grace periods, dunning retries, and cancellation with configurable behavior at each transition.

```
Subscription {
  id: string (sub_*)
  account_id: string (acc_*)
  customer_id: string (cust_*)
  plan_id: string (plan_*)
  status: enum (active, past_due, canceled, trialing, paused)
  current_period_start: timestamp
  current_period_end: timestamp
  cancel_at_period_end: boolean
  trial_end: timestamp (nullable)
  created_at: timestamp
  metadata: map<string, string>
}
```

**State transitions:**

```
trialing → active (trial ends, payment succeeds)
trialing → canceled (trial ends, payment fails after retries)
active → past_due (renewal payment fails)
past_due → active (retry succeeds)
past_due → canceled (all retries exhausted)
active → paused (merchant or customer action)
paused → active (resume action)
active → canceled (explicit cancellation)
```

### 3.5 Invoice

Invoices are generated automatically for subscription renewals and can be created manually for one-time charges.

```
Invoice {
  id: string (inv_*)
  account_id: string (acc_*)
  customer_id: string (cust_*)
  subscription_id: string (nullable)
  status: enum (draft, open, paid, void, uncollectible)
  amount_due: integer
  amount_paid: integer
  currency: string (ISO 4217)
  due_date: timestamp
  line_items: InvoiceLineItem[]
  created_at: timestamp
}

InvoiceLineItem {
  description: string
  amount: integer
  quantity: integer
  period_start: timestamp
  period_end: timestamp
}
```

### 3.6 WebhookEndpoint

Webhook endpoints define where and how event notifications are delivered.

```
WebhookEndpoint {
  id: string (we_*)
  account_id: string (acc_*)
  url: string (HTTPS required)
  events: string[] (event type filters, or ["*"] for all)
  status: enum (active, disabled)
  secret: string (whsec_*)
  api_version: string (locked at creation time)
  created_at: timestamp
  metadata: map<string, string>
}
```

---

## 4. API Design

### 4.1 Base URL and Versioning

```
Production: https://api.paymentflow.io/v1
Sandbox:    https://sandbox.paymentflow.io/v1
```

All endpoints are versioned via {~~URL path~>URL path (see Section 8 for versioning strategy and alternatives under discussion)~~}[^cn-29]. The sandbox environment mirrors production behavior with test PSP backends that simulate success, failure, and edge cases.

### 4.2 Request Format

All requests use JSON body with `Content-Type: application/json`. Authentication via `Authorization: Bearer <token>` header or `Authorization: Basic <base64(api_key:)>` for API key auth.

**Standard headers:**

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer token or API key |
| `Content-Type` | Yes (mutations) | `application/json` |
| `Idempotency-Key` | Yes (mutations) | UUID v4 for safe retries |
| `X-Request-Id` | No | Client-generated trace ID |
| `Accept-Language` | No | Localization for error messages (default: `en-US`) |
| {++`X-Consistency`++}{>>@bob | 2026-02-07<<} | {++No++}{>>@bob<<} | {++`strong` for read-your-writes consistency++}{>>@bob<<} |

### 4.3 Core Endpoints

#### 4.3.1 Payments

```
POST   /v1/payments                    # Create payment
GET    /v1/payments/:id                # Retrieve payment
GET    /v1/payments                    # List payments (paginated)
POST   /v1/payments/:id/capture        # Capture authorized payment
POST   /v1/payments/:id/cancel         # Cancel/void payment
POST   /v1/payments/:id/refund         # Refund payment (full or partial)
```

**Create Payment Request:**

```json
{
  "amount": 5000,
  "currency": "usd",
  "payment_method_id": "pm_abc123",
  "capture": true,
  "description": "Order #1234",
  "statement_descriptor": "ACME*Order1234",
  "metadata": {
    "order_id": "ord_xyz",
    "customer_email": "jane@example.com"
  }
}
```

**Create Payment Response (success):**

```json
{
  "id": "txn_def456",
  "object": "transaction",
  "amount": 5000,
  "currency": "usd",
  "status": "succeeded",
  "payment_method_id": "pm_abc123",
  "psp_provider": "stripe",
  "psp_reference": "pi_3MqR...",
  "risk_score": 0.12,
  "created_at": "2026-02-15T10:30:00Z"
}
```

**Create Payment Response (failure):**

```json
{
  "id": "txn_ghi789",
  "object": "transaction",
  "amount": 5000,
  "currency": "usd",
  "status": "failed",
  "failure_reason": "Your card was declined.",
  "risk_score": 0.87,
  "created_at": "2026-02-15T10:30:01Z"
}
```

#### 4.3.2 Subscriptions

```
POST   /v1/subscriptions               # Create subscription
GET    /v1/subscriptions/:id           # Retrieve subscription
PATCH  /v1/subscriptions/:id           # Update subscription
DELETE /v1/subscriptions/:id           # Cancel subscription
POST   /v1/subscriptions/:id/pause     # Pause subscription
POST   /v1/subscriptions/:id/resume    # Resume subscription
```

#### 4.3.3 Accounts

```
POST   /v1/accounts                    # Create account (onboarding)
GET    /v1/accounts/:id                # Retrieve account
PATCH  /v1/accounts/:id                # Update account settings
GET    /v1/accounts/:id/balance        # Get account balance
POST   /v1/accounts/:id/payouts        # Trigger manual payout
GET    /v1/accounts/:id/payouts        # List payout history
```

#### 4.3.4 Invoices

```
POST   /v1/invoices                    # Create invoice
GET    /v1/invoices/:id                # Retrieve invoice
GET    /v1/invoices                    # List invoices
POST   /v1/invoices/:id/finalize       # Finalize draft invoice
POST   /v1/invoices/:id/pay            # Attempt payment on open invoice
POST   /v1/invoices/:id/void           # Void an open invoice
```

### 4.4 Pagination

All list endpoints support cursor-based pagination using opaque cursor tokens:

```
GET /v1/payments?limit=25&starting_after=txn_abc123
```

**Response envelope:**

```json
{
  "object": "list",
  "data": [...],
  "has_more": true,
  "next_cursor": "txn_xyz789",
  "total_count": 1432
}
```

Maximum page size: 100 items. Default: 25. The `total_count` field is eventually consistent and {~~exact~>approximate for large result sets (>10,000)~~}{>>@alice | 2026-02-08 | sub<<}.

### 4.5 Filtering and Search

List endpoints support filtering via query parameters:

```
GET /v1/payments?status=succeeded&created_after=2026-01-01&currency=usd
GET /v1/subscriptions?status=active&plan_id=plan_abc
GET /v1/invoices?status=open&due_before=2026-03-01
```

Full-text search is available for transaction descriptions and metadata values:

```
GET /v1/payments?q=order+1234
```

Search uses Elasticsearch under the hood. Results are ranked by relevance with a configurable minimum score threshold. Search index updates are eventually consistent (typically <2 seconds).

{++ proposed 2026-02-08 [^cn-20]

### 4.6 Idempotency

All mutating API operations MUST include an `Idempotency-Key` header with a client-generated UUID v4 value. The server guarantees that repeated requests with the same idempotency key produce the same response without duplicate side effects.

**Idempotency semantics:**

- Keys are scoped to the account and endpoint combination
- Keys expire after 24 hours — after expiry, the same key can be reused
- If a request is still processing when a duplicate arrives, the server returns `409 Conflict` with a `Retry-After` header
- Successful responses are cached and returned verbatim for duplicate requests
- Failed responses (4xx) are NOT cached — the client can retry with the same key and different parameters

**Implementation notes:**

- Idempotency keys are stored in Redis with a 24-hour TTL
- The response cache includes HTTP status, headers, and body
- For long-running operations (>5 seconds), the server returns `202 Accepted` with a status URL on the first request and the same `202` with updated status on subsequent requests until completion

++}

---

## 5. Rate Limiting & Quotas

### 5.1 Default Limits

All API endpoints enforce rate limits to ensure platform stability and fair usage across merchants.

| Tier | Limit | Burst | Use Case |
|------|-------|-------|----------|
| Standard | {~~100~>1000~~}[^cn-21] req/min | {~~10~>50~~}[^cn-21] req/sec | Most integrations |
| Enterprise | 5000 req/min | 200 req/sec | High-volume merchants |
| Internal | 10000 req/min | 500 req/sec | Platform services |

{++Tier assignment is automatic based on account volume. Accounts processing >$100K/month are automatically upgraded to Enterprise tier. Manual tier overrides are available via account settings.++}[^cn-22]

### 5.2 Burst Handling

Burst allowance permits temporary spikes above the sustained rate. Bursts are tracked using a token bucket algorithm with 1-second refill granularity.

When rate limits are exceeded, the API returns `429 Too Many Requests` with:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 2
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708012800
```

{++The `Retry-After` value is in seconds and represents the minimum wait time before the next request will be accepted. Clients SHOULD add jitter (0-1 second random delay) to avoid thundering herd effects when multiple clients hit the limit simultaneously.++}[^cn-26]

### 5.3 Per-Endpoint Limits

Some endpoints have additional per-endpoint limits independent of the global rate:

| Endpoint | Limit | Reason |
|----------|-------|--------|
| `POST /v1/payments` | {~~50~>100~~}[^cn-23]/min | PSP aggregate rate limits |
| `POST /oauth/token` | 20/min | Brute-force protection |
| `GET /v1/reports/*` | 10/min | Heavy computation (aggregation queries) |
| {++`POST /v1/webhooks/test`++}[^cn-23] | {++5/min++}[^cn-23] | {++Prevents accidental DDoS of merchant endpoints++}[^cn-23] |

### 5.4 Quota Management

Each account has a monthly quota for expensive operations:

- **Webhook test deliveries:** 1000/month
- **Report generation:** 100/month
- **Bulk export:** 10/month

Quota usage is visible in the dashboard and via `GET /v1/accounts/:id/quotas`. Overages are soft-blocked with a warning email; hard limits are 2x the monthly quota.

---

## 6. Error Handling

### 6.1 Error Response Format

All errors follow a consistent JSON structure:

```json
{
  "error": {
    "type": "invalid_request",
    "code": "amount_too_small",
    "message": "Amount must be at least 50 cents.",
    "param": "amount",
    "doc_url": "https://docs.paymentflow.io/errors/amount_too_small",
    "request_id": "req_abc123"
  }
}
```

Every error includes a `doc_url` linking to a page with {~~detailed explanation and common solutions~>explanation, common causes, and resolution steps~~}[^cn-24]. The `request_id` is always present and can be referenced in support tickets.

### 6.2 Error Types

| Type | HTTP Status | Description |
|------|------------|-------------|
| `invalid_request` | 400 | Malformed request or validation failure |
| `authentication_error` | 401 | Invalid or expired credentials |
| `authorization_error` | 403 | Valid credentials but insufficient permissions |
| `not_found` | 404 | Resource does not exist or is not accessible |
| `conflict` | 409 | Idempotency conflict or invalid state transition |
| `rate_limit` | 429 | Rate limit exceeded |
| `api_error` | 500 | Internal server error (our fault, always retryable) |
| `psp_error` | 502 | Payment provider returned an error |

### 6.3 Retry Semantics

- **Retryable:** 429 (rate limit), 500 (server error), 502 (PSP error), 503 (unavailable)
- **Non-retryable:** 400, 401, 403, 404, 409
- Clients SHOULD implement exponential backoff with jitter
- Maximum recommended retry count: 3
- Retry budget: No more than 10% of total requests should be retries

{++For server errors (500), the response includes a `X-Retry-After` header suggesting when to retry. If absent, use exponential backoff starting at 1 second.++}

### 6.4 PSP Error Mapping

When a downstream PSP returns an error, PaymentFlow normalizes it into the standard error format. The original PSP error is preserved in the response for debugging:

```json
{
  "error": {
    "type": "psp_error",
    "code": "card_declined",
    "message": "The card was declined by the issuing bank.",
    "psp_error": {
      "provider": "stripe",
      "code": "card_declined",
      "decline_code": "insufficient_funds",
      "raw_message": "Your card has insufficient funds."
    }
  }
}
```

---

## 7. Webhooks & Event System

### 7.1 Event Types

PaymentFlow emits events for all significant state changes. Events follow a `resource.action` naming convention.

**Payment events:**

- `payment.created` — Payment initiated
- `payment.processing` — Payment submitted to PSP
- `payment.succeeded` — Payment completed successfully
- `payment.failed` — Payment failed (includes failure reason)
- `payment.refunded` — Full or partial refund processed
- `payment.disputed` — Chargeback or dispute opened
- `payment.dispute.resolved` — Dispute resolved (won or lost)

**Subscription events:**

- `subscription.created` — New subscription started
- `subscription.updated` — Subscription plan or settings changed
- `subscription.canceled` — Subscription canceled
- `subscription.trial_ending` — Trial ends in 3 days (configurable)
- `subscription.payment_failed` — Renewal payment failed (dunning starts)
- `subscription.paused` — Subscription paused
- `subscription.resumed` — Subscription resumed from pause

**Account events:**

- `account.updated` — Account settings changed
- `account.payout.created` — Payout initiated
- `account.payout.paid` — Payout completed
- `account.payout.failed` — Payout failed

### 7.2 Delivery Guarantees

PaymentFlow provides {~~exactly-once~>at-least-once~~}[^cn-27] delivery with best-effort ordering. Events include a monotonically increasing sequence number per account for client-side deduplication and ordering verification.

**Retry policy:**

- Failed deliveries (non-2xx response or timeout) are retried with exponential backoff
- Retry schedule: {~~1min, 5min, 30min, 2hr, 12hr, 24hr~>30sec, 2min, 15min, 1hr, 4hr, 12hr, 24hr~~}[^cn-25]
- Maximum retry period: {~~72~>48~~}[^cn-25] hours
- After 72 hours, the event is marked as `failed` and an email notification is sent to the account owner
- {++Failed events are available via `GET /v1/events?delivery_status=failed` for manual replay++}[^cn-28]

### 7.3 Webhook Signatures

All webhook payloads are signed using HMAC-SHA256 with the endpoint's secret key.

**Verification pseudocode:**

```
timestamp = request.headers['X-PaymentFlow-Timestamp']
signature = request.headers['X-PaymentFlow-Signature']
payload = f"{timestamp}.{request.body}"
expected = hmac_sha256(endpoint_secret, payload)
verify(signature == expected)
verify(abs(now() - timestamp) < 300)  # 5-minute tolerance
```

The {~~5-minute~>5-minute (300-second)~~}[^cn-30] tolerance window prevents replay attacks while accommodating clock skew. The timestamp and signature together ensure both authenticity and freshness.

### 7.4 Event Schema

```json
{
  "id": "evt_abc123",
  "object": "event",
  "type": "payment.succeeded",
  "api_version": "2026-02-01",
  "created_at": "2026-02-15T10:30:00Z",
  "sequence": 42,
  "data": {
    "object": {
      "id": "txn_def456",
      "amount": 5000,
      "currency": "usd",
      "status": "succeeded"
    }
  },
  "previous_attributes": {
    "status": "processing"
  }
}
```

The `previous_attributes` field contains only the fields that changed in this event, enabling efficient delta processing without fetching the full resource.

---

## 8. Versioning Strategy

### 8.1 Approach

PaymentFlow uses URL path versioning (`/v1/`, `/v2/`). Each major version is a distinct, stable API surface.

**Version lifecycle:**

| Stage | Description | Duration |
|-------|-------------|----------|
| Active | Receiving new features and bug fixes | Indefinite |
| Maintenance | Bug fixes and security patches only | Minimum 12 months |
| Deprecated | Sunset header included, removal date announced | Minimum 24 months |
| Removed | Returns `410 Gone` | — |

### 8.2 Breaking Changes Policy

The following changes are considered breaking and require a new major version:

- Removing or renaming an endpoint
- Removing or renaming a response field
- Changing the type of a response field
- Adding a new required request parameter
- Changing error codes or HTTP status codes for existing conditions
- Changing the default behavior of an existing parameter

The following are NOT breaking changes:

- Adding new optional request parameters
- Adding new response fields
- Adding new endpoints
- Adding new event types
- Adding new enum values (clients MUST handle unknown values gracefully)
- Adding new error codes under existing error types

### 8.3 API Changelog

Every API change is documented in a machine-readable changelog at:

```
GET /v1/changelog
GET /v1/changelog?since=2026-02-01
```

The changelog includes change type (addition, deprecation, breaking), affected endpoints, and migration guidance. SDKs can consume this endpoint to surface deprecation warnings at development time.

---

## 9. Security

### 9.1 PCI DSS Compliance

PaymentFlow is PCI DSS Level 1 certified. Card data handling follows the tokenization model:

{++- Raw card numbers are captured by the client-side SDK (JavaScript or mobile) and sent directly to our tokenization service via a dedicated subdomain (`vault.paymentflow.io`)
- Card numbers never reach the main API servers — the tokenization service returns a `pm_*` token
- The tokenization service is a separate, hardened environment with its own network boundary, audit trail, and key management
- PAN data in transit is encrypted with TLS 1.3 (no fallback)
- Tokenized card data at rest is encrypted with AES-256-GCM
- Encryption keys are managed via AWS KMS with annual automatic rotation and separate key hierarchies per account++}[^cn-31]

### 9.2 Data Encryption

**In transit:** TLS 1.3 required for all API connections. TLS 1.2 accepted for legacy clients with a `Deprecation: TLS-1.2` response header. TLS 1.1 and below are rejected with a `426 Upgrade Required` response.

**At rest:** All sensitive data (card tokens, bank account details, PII) is encrypted with AES-256-GCM using per-account key hierarchies. Non-sensitive metadata uses volume-level encryption (AWS EBS encryption).

**Key hierarchy:**

```
Root Key (AWS KMS, region-locked)
  └─ Account Master Key (per account, derived)
       ├─ Card Data Key (rotated annually)
       ├─ PII Data Key (rotated annually)
       └─ Audit Log Key (rotated annually)
```

### 9.3 {~~Audit Logging~>Audit Logging & Compliance Trail~~}[^cn-32]

All API operations generate audit log entries with the following structure:

```json
{
  "timestamp": "2026-02-15T10:30:00Z",
  "actor": {
    "type": "user",
    "id": "user_abc",
    "ip_address": "203.0.113.42",
    "user_agent": "PaymentFlow-SDK/1.2.3"
  },
  "action": "payment.create",
  "resource": "txn_def456",
  "result": "success",
  "changes": {
    "status": ["pending", "succeeded"]
  },
  "request_id": "req_xyz789"
}
```

Audit logs are retained for 7 years (PCI DSS requirement). Logs are immutable and tamper-evident (append-only with hash chaining). Access to audit logs requires the `audit:read` scope and generates its own audit entry (auditing the auditor).

### 9.4 Fraud Detection Integration

PaymentFlow integrates with third-party fraud detection services (Sift, Sardine, or merchant-provided models) via a pre-authorization hook:

1. Payment request received
2. Pre-auth hook sends transaction context to fraud service
3. Fraud service returns risk score and recommendation (allow/review/block)
4. PaymentFlow applies the recommendation based on account-level rules
5. If `review`, the payment is held and a `payment.review_required` event is emitted

Merchants can configure risk thresholds, override rules, and manual review queues in the dashboard.

---

## 10. Migration & Rollout

### 10.1 Phase 1: Core Payments (2026-Q3)

**Scope:**

- Payment creation, capture, cancel, refund
- Basic subscription management (create, update, cancel, pause, resume)
- Stripe PSP integration only
- OAuth 2.0 + API key authentication
- Webhook delivery for payment and subscription events
- Dashboard: payment list, transaction detail, basic analytics

**Launch criteria:**

- 99.99% uptime over 30-day burn-in period
- <100ms P95 latency for payment creation
- PCI DSS Level 1 audit completed
- 10 beta merchants onboarded and validated
- Runbook coverage for all P0/P1 incident scenarios

### 10.2 Phase 2: Multi-PSP + Payouts (2026-Q4)

**Scope:**

- Adyen and Braintree PSP integrations
- Intelligent payment routing (cost/success rate optimization)
- Marketplace payout support (Connect-style)
- Advanced subscription features (trials, proration, usage-based billing)
- Invoice generation and management
- Dashboard: routing analytics, payout management

### 10.3 Phase 3: Analytics + Self-Service (2027-Q1)

**Scope:**

- Real-time analytics dashboard with custom date ranges and drill-down
- Self-service merchant onboarding (KYC/KYB flow)
- Custom reporting and CSV/PDF export
- Advanced fraud detection integration (see Section 9.4)
- API changelog and migration tooling
- SDKs for Python, Node.js, Ruby, Go, Java

### 10.4 Backwards Compatibility

During migration between API versions:

- v1 API will maintain backwards compatibility for minimum 24 months after v2 launch
- Deprecation warnings via `Sunset` and `Deprecation` headers
- Migration guides published for each breaking change, with before/after code examples
- Sandbox environment for testing migrations before production cutover
- Automated migration compatibility checker: `POST /v1/compatibility-check` accepts a request body and returns warnings about v2 incompatibilities

---

## Open Questions

1. **Webhook delivery SLA:** Should we guarantee delivery latency (e.g., 95th percentile under 30 seconds)? This has infrastructure cost implications.

2. **Multi-region deployment:** When do we need cross-region for data residency (GDPR, LGPD)? Phase 2 or Phase 3?

3. **GraphQL endpoint:** Should we offer GraphQL alongside REST for dashboard/frontend use cases? Several merchants have requested it.

4. **PSD2/SCA:** How do we handle Strong Customer Authentication for European payments? Need to design the 3DS flow.

5. **Rate limit fairness:** The current per-account model means one abusive endpoint in a merchant's integration can starve their other endpoints. Should we implement per-endpoint budgets within the account quota?

---

[^cn-1]: @alice | 2026-02-15 | sub | accepted
    approved: @carol 2026-02-15
    @alice 2026-02-15: Bumping version to reflect scope of changes

[^cn-2]: @alice | 2026-02-15 | sub | accepted

[^cn-3]: @carol | 2026-02-07 | sub | accepted
    approved: @alice 2026-02-07
    @carol 2026-02-07: Moving to Active Review now that all reviewers have started

[^cn-4]: @carol | 2026-02-06 | sub | accepted
    approved: @alice 2026-02-06
    context: "PaymentFlow is a {payment processing service} for mid-size"
    @carol 2026-02-06: "Orchestration" better captures the multi-PSP routing value prop
      @alice 2026-02-06: Agreed, and it differentiates us from single-PSP wrappers

[^cn-5]: @alice | 2026-02-03 | ins | accepted
    approved: @carol 2026-02-07
    @alice 2026-02-03: Scoping the target market explicitly. Under $1M doesn't need us, over $100M builds in-house.

[^cn-6]: @alice | 2026-02-03 | sub | accepted
    amend: team
    context: "PaymentFlow supports {API key authentication} appropriate for"
    @alice 2026-02-03: Moving from API keys to OAuth 2.0 as primary auth. API keys remain for server-to-server but OAuth gives us proper scoping, token rotation, and SSO support.
      @bob 2026-02-04 [question]: What about SPAs and mobile apps? Plain OAuth 2.0 without PKCE is vulnerable to authorization code interception. We learned this the hard way at my last company — a malicious app on the same device intercepts the redirect URI.
        @alice 2026-02-04: Good point. My assumption was server-side only initially, but we absolutely need SPA and mobile support. Adding PKCE makes sense for all flows.
          @bob 2026-02-05: Not just for public clients — PKCE should be required for ALL flows including confidential clients. The security benefit is real and the implementation cost is trivial. Eliminates an entire class of attacks.
            @alice 2026-02-05: Convinced. Let's require PKCE universally.
    revised @bob 2026-02-05: "OAuth 2.0" → "OAuth 2.0 with PKCE" — required for all client types
    @carol 2026-02-06 [suggestion]: The PKCE addition also simplifies our documentation — one flow instead of two (public vs confidential). But we should cite the RFC for implementors.
      @alice 2026-02-06: Good call. RFC 7636 is the spec.
    revised @carol 2026-02-06: "OAuth 2.0 with PKCE" → "OAuth 2.0 with PKCE (RFC 7636)" — adding RFC citation for implementor clarity
      @bob 2026-02-06: Nitpick — the PKCE extension is RFC 7636 but the OAuth 2.0 core is RFC 6749. Do we cite both?
        @carol 2026-02-06: Just 7636. Core OAuth is assumed knowledge for anyone implementing auth. The PKCE citation is what matters because it's the unusual part.
          @bob 2026-02-06: Fair.
    approved: @bob 2026-02-05
    approved: @carol 2026-02-06 "PKCE simplifies the security model and docs"
    approved: @alice 2026-02-06
    resolved @carol 2026-02-06: Accepted with Bob's PKCE amendment and Carol's RFC citation

[^cn-7]: @bob | 2026-02-04 | ins | accepted
    approved: @alice 2026-02-05
    @bob 2026-02-04: "Authentication" alone undersells the section. We're defining authorization scopes, role-based access, and permission models — that's authorization, not just auth.
    resolved @alice 2026-02-05

[^cn-8]: @alice | 2026-02-06 | ins | proposed
    context: "Key rotation: Create new key ... merchant action."
    @alice 2026-02-06: We need to set a deprecation timeline. OAuth client credentials gives us everything API keys do, with better security properties.
      @bob 2026-02-07 [issue/blocking]: Enterprise clients have 2-year contracts that explicitly guarantee API key support. Legal reviewed this last quarter — we can't deprecate without a contractual amendment process.
        @alice 2026-02-07: Can we grandfather existing contracts and deprecate for new signups only?
          @bob 2026-02-08: That creates two support paths indefinitely. I'd rather have one long sunset than a permanent fork.
            @alice 2026-02-08: 24-month sunset with active migration support? We'd start the clock when v2 launches with client credentials.
              @ai:claude-opus-4.6 2026-02-09 [suggestion]: The sunset could include automated migration tooling — a one-click "convert my API key integration to client credentials" in the dashboard. That reduces the migration burden enough that even reluctant enterprise clients would switch before the deadline.
                @bob 2026-02-09: Migration tooling helps but doesn't address the contractual issue. We need legal signoff on the deprecation timeline before this can proceed.
    open -- awaiting legal review of enterprise contract implications

[^cn-9]: @ai:claude-opus-4.6 | 2026-02-08 | sub | accepted
    context: "Access tokens: {60-minute} expiry ... {24}-hour grace period"
    @ai:claude-opus-4.6 2026-02-08: Three related changes bundled: (1) Reduce access token lifetime from 60 to 15 minutes — shorter tokens reduce the window for stolen token abuse. (2) Extend API key rotation grace period from 24 to 48 hours — 24 hours is too tight for enterprises with complex deployment pipelines.
      @bob 2026-02-08 [question]: 15 minutes is aggressive. What's the expected refresh rate impact on our token endpoint?
        @ai:claude-opus-4.6 2026-02-08: At current scale (est. 50K active sessions), 15-min tokens = ~3.3K refresh calls/min vs ~830/min with 60-min tokens. The token endpoint is lightweight (Redis lookup + JWT sign). The rate limit is set at 20/min per account — no single account would hit it even with aggressive client behavior.
    revised @bob 2026-02-09: "60-min / 24-hr grace" → "15-min / 48-hr grace" — token hardening + operational buffer
    approved: @bob 2026-02-09 "Token hardening makes sense. 48hr grace is operationally necessary."
    approved: @alice 2026-02-10
    resolved @bob 2026-02-09

[^cn-10]: @bob | 2026-02-06 | ins | proposed
    @bob 2026-02-06: mTLS is the gold standard for service-to-service auth in payment systems. We can't rely on network perimeter alone — zero-trust requires mutual authentication at every hop.
      @ai:kimi-k2 2026-02-10 [question]: Are you proposing mTLS for all internal services or just the payment-critical path? Full mesh mTLS has significant operational overhead — certificate distribution, rotation monitoring, debugging TLS handshake failures in production.
        @bob 2026-02-11: Payment-critical path only for v1. That's: API gateway → payment service → PSP adapter. Three hops. The rest can use service mesh mTLS (Istio/Linkerd) which handles cert management automatically.
          @ai:kimi-k2 2026-02-11: That's reasonable. Istio sidecar mTLS for the mesh, explicit mTLS with pinning for the critical path. Two different trust models but they compose cleanly.
    open

[^cn-11]: @ai:claude-opus-4.6 | 2026-02-08 | ins | proposed
    @ai:claude-opus-4.6 2026-02-08: The scope table is missing two important scopes that other sections reference. `reports:read` is needed for the analytics dashboard (Phase 3) and `disputes:manage` is needed for the chargeback workflow (Section 9.4). Adding them now prevents a breaking change later — adding a required scope is a breaking change per Section 8.2.
      @carol 2026-02-09: Good catch on forward compatibility. Should we also add `invoices:manage`?
        @ai:claude-opus-4.6 2026-02-09: Invoices are covered under `payments:write` for now. If we need finer granularity, we can add it as a non-breaking addition.
    open

[^cn-12.1]: @carol | 2026-02-07 | sub | accepted
    @carol 2026-02-07: Section header rename as part of User→Account migration

[^cn-12.2]: @carol | 2026-02-07 | sub | accepted
    @carol 2026-02-07: Entity reference in description

[^cn-12.3]: @carol | 2026-02-07 | sub | accepted
    @carol 2026-02-07: Scope reference in description

[^cn-12]: @carol | 2026-02-07 | group | accepted
    approved: @alice 2026-02-07
    approved: @bob 2026-02-08
    @carol 2026-02-07: Renaming "User" to "Account" throughout. "User" implies a person; "Account" correctly implies an organization. This aligns with Stripe's naming (they also use Account for the merchant entity) and avoids confusion with end-customers.
      @alice 2026-02-07: Agreed. Our customers are organizations not individuals. Good catch.
    resolved @alice 2026-02-07

[^cn-13]: @alice | 2026-02-05 | ins | proposed
    context: "updated_at: timestamp ... metadata: map<string, string>"
    @alice 2026-02-05: Adding encrypted_at timestamp for compliance audit trail. We need to prove when card data was encrypted — PCI DSS Requirement 3.5.
      @bob 2026-02-06: Makes sense for PCI.
    approved: @bob 2026-02-06
    resolved @bob 2026-02-06: Straightforward compliance field
    reopened @ai:kimi-k2 2026-02-10: The encrypted_at field creates an information leak. If an attacker can read encrypted_at timestamps across transactions, they can infer when encryption key rotations happened (timestamps cluster around rotation events). Combined with knowledge of our KMS rotation schedule, this narrows the keyspace for offline attacks. The field should either be omitted or normalized to a daily granularity.
      @bob 2026-02-11: Kimi's right. I approved too quickly. We can use date-only precision (2026-02-15 instead of 2026-02-15T10:30:00Z) — that satisfies the PCI requirement without leaking rotation timing.
        @alice 2026-02-12: Date-only works for compliance. I'll update the type to `date` instead of `timestamp`.
    open -- pending field type update to date precision

[^cn-14]: @bob | 2026-02-06 | del | accepted
    approved: @alice 2026-02-06
    @bob 2026-02-06: failure_code is redundant with failure_reason. Numeric error codes are a legacy pattern — our error system uses string codes (Section 6). Keeping both creates a mapping maintenance burden.
    resolved @alice 2026-02-06

[^cn-15]: @ai:claude-opus-4.6 | 2026-02-08 | ins | proposed
    @ai:claude-opus-4.6 2026-02-08: Payment method fingerprinting enables duplicate detection across customers. Two customers adding the same card get the same fingerprint — useful for fraud detection (same card used across many accounts) and for deduplication (prevent accidental double-add). Stripe and Adyen both provide fingerprints; we normalize to a consistent internal format.
      @bob 2026-02-09 [question]: How is the fingerprint derived? If it's a hash of the card number, we need to ensure the hashing algorithm is consistent across PSPs and resistant to rainbow table attacks.
        @ai:claude-opus-4.6 2026-02-09: HMAC-SHA256 of the card number using a per-account secret. This gives us: (1) consistent fingerprints within an account regardless of PSP, (2) different fingerprints across accounts (prevents cross-account correlation), (3) rainbow table resistance via the HMAC key.
    open

[^cn-16]: @bob | 2026-02-09 | sub | proposed
    superseded-by: ct-17
    context: "All endpoints are versioned via {URL path}"
    @bob 2026-02-09: I know we drafted this as REST, but I've been benchmarking our internal prototypes and gRPC gives us 3x throughput improvement for the payment creation hot path. Protobuf serialization is 10x smaller than JSON for our typical payloads.
      @alice 2026-02-09: gRPC is great for internal services but terrible for developer experience. Our target merchants use Python, Node, Ruby — languages where REST+JSON is the path of least resistance. gRPC requires protobuf compilation, different HTTP libraries, and debugging is harder (no curl).
        @bob 2026-02-10: We could offer both — REST for convenience, gRPC for performance. Stripe does this with their high-throughput Terminal API.
          @alice 2026-02-10: Maintaining two protocol surfaces from day one doubles our API contract testing burden. I'd rather launch with REST and add gRPC as an opt-in for high-volume merchants in Phase 2.
            @bob 2026-02-10: Acceptable if we design the internal service layer on gRPC now so the external gRPC surface is just a passthrough later.
    open -- REST vs gRPC debate continues

[^cn-17]: @ai:kimi-k2 | 2026-02-10 | sub | proposed
    supersedes: ct-16
    proposed-text: "URL path with header-based minor versioning (see Section 8 for details)"
    @ai:kimi-k2 2026-02-10: I've reviewed both ct-16 proposals. Neither REST nor gRPC is the right framing — this is actually a versioning question masquerading as a protocol question. The real issue: how do you evolve the API without breaking clients?
    URL path versioning (`/v1/`, `/v2/`) forces a big-bang migration. Header versioning (`Accept: application/vnd.paymentflow.v1+json`) allows gradual evolution. I'm proposing a hybrid: URL path for major versions (breaking changes), custom header for minor versioning (non-breaking additions that change response shape).
      @bob 2026-02-11: This is orthogonal to the REST vs gRPC question. I still want gRPC for the hot path regardless of versioning strategy.
        @ai:kimi-k2 2026-02-11: Agreed it's orthogonal, but it reframes the debate. If we solve versioning properly, adding gRPC as an alternative protocol in Phase 2 becomes a non-breaking addition — merchants can opt in via `Accept: application/vnd.paymentflow.v1+proto` without URL changes.
          @alice 2026-02-12: I actually like this hybrid approach. It gives Bob his gRPC path without forking the URL space.
    open -- hybrid versioning proposal under discussion

[^cn-20]: @ai:claude-opus-4.6 | 2026-02-08 | ins | proposed
    @ai:claude-opus-4.6 2026-02-08: Idempotency is mentioned in Section 1.4 (Architectural Principles) and referenced by the Idempotency-Key header in Section 4.2, but there's no dedicated section explaining the semantics. This is critical documentation — idempotency misunderstandings are the #1 cause of payment duplication bugs in production. Adding a complete section with implementation notes and edge cases.
      @alice 2026-02-09: Agreed this is a gap. The semantics are subtle — especially the "failed responses are not cached" behavior, which is intentional but surprising.
        @bob 2026-02-10 [question]: The 24-hour key expiry seems arbitrary. Stripe uses 48 hours. What's our rationale?
          @ai:claude-opus-4.6 2026-02-10: 24 hours is sufficient for retry scenarios (exponential backoff with 3 retries completes in <1 hour). Shorter expiry reduces storage costs. But 48 hours is safer for merchants with nightly batch processing — a payment initiated at 11pm and retried at 1am the next day would still be within the 24hr window, but a batch job that processes at 11pm two nights in a row could accidentally reuse a key. Changing to 48 hours is defensible.
    open

[^cn-21]: @alice | 2026-02-03 | sub | proposed
    context: "Standard | {100} req/min | {10} req/sec"
    @alice 2026-02-03: Increasing default from 100 to 1000 req/min. 100 is way too low for any real integration — a merchant with 50 concurrent users would hit the limit during normal operation.
      @bob 2026-02-04 [issue/blocking]: 1000 req/min per account is fine for legitimate use. My concern is abuse detection — at 1000/min, a compromised API key could make 1.44M requests/day before we notice. Our current monitoring alerts at 10x sustained rate but that's 10K/min which is meaningful load on our infrastructure.
        @alice 2026-02-04: What limits do comparable services use? Stripe is 100/sec (6000/min) in live mode. We're proposing 1000/min which is well below that.
          @bob 2026-02-05: Stripe also has a massive infrastructure budget. Our PSP integrations have their own rate limits — if 50 accounts all burst to 1000/min simultaneously, that's 50K req/min hitting Stripe which might trip THEIR limits.
            @ai:claude-opus-4.6 2026-02-08 [suggestion]: The per-account limit debate misses the real constraint: downstream PSP rate limits. I'd suggest: (1) 1000 req/min per account (Alice's number), (2) 100 req/min per account for payment creation specifically (matches Stripe's recommendation for new integrations), (3) Global PSP budget tracking that dynamically throttles when we approach PSP limits.
              @bob 2026-02-09: The PSP budget tracking is the right answer. Per-endpoint limits (Section 5.3) partially address this but a dynamic budget is better. 1000/min global with 100/min for payments is reasonable.
                @alice 2026-02-10: Accepting 1000/min global, 100/min for payment creation. The dynamic PSP budget is a Phase 2 feature — too complex for launch.
    revised @ai:claude-opus-4.6 2026-02-10: "100 req/min, 10 req/sec" → "1000 req/min, 50 req/sec" — consensus from discussion: higher base with per-endpoint guards
      @alice 2026-02-11: Claude captured the consensus correctly. The burst column should also be updated — 50 req/sec for Standard tier is appropriate with the new limit.
        @bob 2026-02-11: Confirmed. The numbers work. I'd also note that the per-endpoint limit for payment creation (100/min, ct-23) serves as the real safety valve.
    revised @bob 2026-02-11: "1000 req/min, 50 req/sec" → "1000 req/min, 50 req/sec (with per-endpoint guards per Section 5.3)" — adding cross-reference to make the safety mechanism explicit
    approved: @alice 2026-02-11
    approved: @bob 2026-02-11 "Numbers work with the per-endpoint safety valve"
    open -- pending formal phase 2 tracking item for dynamic PSP budget

[^cn-22]: @alice | 2026-02-05 | ins | accepted
    approved: @bob 2026-02-06
    @alice 2026-02-05: Automatic tier upgrades reduce support burden — merchants shouldn't have to ask for higher limits.

[^cn-23]: @bob | 2026-02-08 | sub | proposed
    @bob 2026-02-08: Two changes: (1) Increase payment creation limit from 50 to 100/min — 50 was too conservative even for standard tier. (2) Add webhook test endpoint limit — without it, a misconfigured test script could DDoS a merchant's own webhook receiver.
    open

[^cn-24]: @alice | 2026-02-05 | sub | accepted
    approved: @bob 2026-02-06
    context: "linking to a page with {detailed explanation and common solutions}"
    @alice 2026-02-05: "Resolution steps" is more actionable than "common solutions". We want docs that tell you what to do, not just what went wrong.

[^cn-26]: @bob | 2026-02-07 | ins | accepted
    approved: @alice 2026-02-08
    @bob 2026-02-07: Jitter is critical for distributed systems. Without it, all rate-limited clients retry simultaneously and create a thundering herd. This is a one-line code change for clients but prevents cascading failures.

[^cn-27]: @bob | 2026-02-08 | sub | proposed
    context: "PaymentFlow provides {exactly-once} delivery"
    @bob 2026-02-08: Exactly-once delivery is impossible in distributed systems without two-phase commit between our server and the merchant's endpoint. At-least-once with idempotency keys is the honest guarantee. Every payment webhook system that claims exactly-once is lying or has a footnote that says "in practice, at-least-once."
      @alice 2026-02-08: I wrote "exactly-once" because that's what we WANT to provide. The implementation is at-least-once with dedup, which from the merchant's perspective IS exactly-once if they implement the sequence number check.
        @bob 2026-02-09 [issue]: That's a dangerous framing. If we document "exactly-once" and a merchant doesn't implement dedup because they trusted our docs, they process duplicate refunds and lose money. We had this exact bug at my last company. Document the real guarantee; let merchants build their own exactly-once on top.
          @alice 2026-02-09: You're right, and I hate that you're right. Fine. At-least-once it is. But we need to make the dedup guidance extremely prominent.
            retracted @alice 2026-02-09: (removed frustration about being corrected on a point I know is technically right)
          @ai:claude-opus-4.6 2026-02-10: The exactly-once vs at-least-once debate is well-settled in distributed systems literature. Bob is correct — the honest documentation protects merchants. The sequence number + idempotency key combination gives merchants the TOOLS for exactly-once processing without us making a guarantee we can't keep.
            edited @bob 2026-02-11: "two-phase commit" → "two-phase commit or distributed transaction" — other protocols achieve exactly-once but all require receiver coordination
    open -- wording agreed, pending final review

[^cn-28]: @alice | 2026-02-10 | ins | proposed
    @alice 2026-02-10: Failed event replay is table stakes. Without it, a webhook endpoint outage means lost events — merchants would need to poll our API to find what they missed.
      @bob 2026-02-10: Agreed. We should also add `GET /v1/events` as a general-purpose event listing endpoint, not just for failures. Some merchants prefer polling over webhooks for reliability.
    open

[^cn-29]: @ai:kimi-k2 | 2026-02-10 | sub | proposed
    context: "PaymentFlow uses {URL path} versioning"
    @ai:kimi-k2 2026-02-10: See ct-17 for the full versioning discussion. This inline change reflects the hybrid proposal — URL path for major versions, header for minor. Keeping this linked to the broader debate in ct-17.
    open

[^cn-31]: @bob | 2026-02-06 | ins | accepted
    approved: @alice 2026-02-07
    @bob 2026-02-06: The PCI section was too vague. Spelling out the tokenization architecture explicitly because this is the #1 thing auditors ask about. The vault separation is critical — it means a breach of the main API servers doesn't expose card data.
      @carol 2026-02-07: This is also important for the sales deck — "card numbers never touch our API servers" is a one-sentence differentiator.
    resolved @bob 2026-02-07

[^cn-32]: @alice | 2026-02-10 | sub | proposed
    context: "### 9.3 {Audit Logging}"
    @alice 2026-02-10: Adding "Compliance Trail" to the title because the audit log serves two audiences — operatonal debugging (who did what) and compliance auditors (prove you track everything). The current title only signals the first.
      @bob 2026-02-11: the actor object structure is good — having separate type/id fields means we can track API key actions vs user actions vs system actions distinctly
        @ai:claude-opus-4.6 2026-02-11 [suggestion]: Consider adding a `context` field to the audit entry that captures the business context (e.g., "subscription renewal" for a payment created by the billing system). This helps compliance auditors distinguish automated actions from manual ones without cross-referencing multiple log sources.
    open

[^cn-33]: @alice | 2026-02-05 | sub | proposed
    context: "Phase 1 launch: {2026-Q2}"
    @alice 2026-02-05: Pushing Phase 1 from Q2 to Q3. The OAuth implementation and PCI audit are taking longer than estimated. Q2 was aggressive — Q3 gives us a realistic buffer.
      @carol 2026-02-07 [issue]: Q3 pushes our go-to-market plan back a full quarter. Can we do a limited launch in Q2 with API keys only and add OAuth in Q3?
        @alice 2026-02-08: Launching without OAuth means launching without proper authorization scoping. Bob would veto that and he'd be right.
          @bob 2026-02-08: Confirmed. No launch without OAuth+PKCE. The security baseline is non-negotiable.
            @carol 2026-02-09: Understood. Q3 it is. I'll adjust the GTM timeline.
    open -- timeline acknowledged but not formally approved

[^cn-34]: @bob | 2026-02-07 | ins | accepted
    approved: @alice 2026-02-08
    @bob 2026-02-07: Performance goals should be explicit and measurable. Sub-100ms P95 is achievable for synchronous operations. Async operations (webhooks, payouts) have different SLAs.

[^cn-35]: @carol | 2026-02-09 | ins | accepted
    approved: @alice 2026-02-09
    @carol 2026-02-09: Forward reference to the fraud section. Without the non-goal being explicit, we'll get feature requests for built-in fraud scoring.

[^cn-25]: @alice | 2026-02-06 | sub | proposed
    amend: team
    context: "Retry schedule: {1min, 5min, 30min, 2hr, 12hr, 24hr} ... Maximum retry period: {72} hours"
    @alice 2026-02-06: The current retry schedule is too aggressive at the start (1min first retry) and too lenient at the end (72 hours total). First retry at 30 seconds catches transient failures faster. Cutting to 48 hours total because if a webhook endpoint is down for 3 days, the merchant has bigger problems than missed events — they should be using the event replay API.
      @bob 2026-02-07 [issue]: 30 seconds for first retry is too fast. A common failure pattern is deployment-induced downtime (rolling deploys, blue-green switches). These typically last 60-90 seconds. A 30-second retry will hit the same deployment window and waste a retry attempt.
        @alice 2026-02-07: Good point. What's your counter-proposal?
          @bob 2026-02-07: First retry at 60 seconds, then 5min, 30min, 2hr, 8hr, 24hr. Total window: 48 hours (matching your reduction). The 60-second first retry clears most deployment windows.
            @ai:claude-opus-4.6 2026-02-08 [suggestion]: Neither schedule accounts for the webhook endpoint's retry-after header. If the endpoint returns `503 Service Unavailable` with a `Retry-After: 120`, we should respect that rather than following our fixed schedule. I'd propose: use the fixed schedule as the DEFAULT, but honor `Retry-After` headers from the endpoint. Cap the maximum `Retry-After` at 1 hour to prevent abuse.
              @bob 2026-02-08: The Retry-After logic is good but adds complexity. Can we ship with the fixed schedule and add Retry-After support in Phase 2?
                @ai:claude-opus-4.6 2026-02-08: The implementation is trivial — one header check before scheduling the next retry. Deferring creates a behavior change between phases that merchants would need to adapt to. Ship it now.
                  @alice 2026-02-09: I agree with Claude. It's a small addition and avoids a breaking behavior change later.
    revised @bob 2026-02-07: "1min, 5min, 30min, 2hr, 12hr, 24hr / 72hr" → "60sec, 5min, 30min, 2hr, 8hr, 24hr / 48hr" — deployment-safe first retry interval
      @alice 2026-02-08: The 60-second first retry is reasonable. But the gap from 8hr to 24hr is too large — if a 4-hour outage resolves at hour 9, the merchant waits 15 more hours.
        @bob 2026-02-08: Fair. Adding a 12hr step: 60sec, 5min, 30min, 2hr, 8hr, 12hr, 24hr.
    revised @ai:claude-opus-4.6 2026-02-09: "60sec, 5min, 30min, 2hr, 8hr, 24hr / 48hr" → "60sec, 5min, 30min, 2hr, 8hr, 12hr, 24hr / 48hr + Retry-After support" — adding 12hr step and server-side Retry-After header support
      @bob 2026-02-09: The combined proposal is solid. 7-step schedule with Retry-After override.
    revised @carol 2026-02-10: "60sec, 5min, 30min, 2hr, 8hr, 12hr, 24hr / 48hr + Retry-After" → "30sec, 2min, 15min, 1hr, 4hr, 12hr, 24hr / 48hr + Retry-After" — product feedback: merchants want faster initial retries, the deployment-window concern is addressed by Retry-After
      @bob 2026-02-10 [issue]: Carol, this undoes the deployment-safe 60-second first retry we agreed on. 30 seconds hits the deployment window.
        @carol 2026-02-10: With Retry-After support, the endpoint can tell us to wait during deployments. The 30-second default catches the 80% case (transient network blips). The 20% case (deployments) is handled by the endpoint's own 503+Retry-After response.
          @bob 2026-02-11: ...that's actually a good argument. The Retry-After support changes the calculus. 30 seconds is fine if the endpoint can push back. Withdrawing my objection.
            @alice 2026-02-11: Agreed. Carol's schedule is more aggressive but the Retry-After safety valve makes it defensible.
    approved: @alice 2026-02-11
    approved: @bob 2026-02-11 "Retry-After support makes the aggressive schedule safe"
    approved: @ai:claude-opus-4.6 2026-02-11
    open -- needs implementation spec for Retry-After cap and abuse prevention

[^cn-30]: @bob | 2026-02-09 | sub | proposed
    amend: solo
    context: "The {5-minute} tolerance window prevents replay attacks"
    @bob 2026-02-09: Adding "(300-second)" for implementors who need the exact number. API docs that say "5 minutes" without the exact seconds value lead to off-by-one bugs — is it 300 seconds? 299? 301? Stripe had this exact problem with their webhook tolerance docs.
      @carol 2026-02-09: Is this worth a tracked change? It's literally adding 3 words.
        @bob 2026-02-09: It's a spec-level clarification that prevents implementation bugs. The change is small. The impact of ambiguity is not.
          @alice 2026-02-10 [question]: Should we also specify whether the window is inclusive or exclusive? "abs(now() - timestamp) < 300" means strictly less than 300 seconds, but some implementations use <= 300.
            @bob 2026-02-10: Good catch. The pseudocode says `< 300` which is exclusive. That's correct — at exactly 300 seconds the tolerance has expired. But you're right that this should be explicit in the prose.
              @ai:kimi-k2 2026-02-11 [suggestion]: The bigger issue is clock skew direction. The tolerance should be asymmetric: allow timestamps up to 300 seconds IN THE PAST but only 30 seconds IN THE FUTURE. Future timestamps indicate clock misconfiguration, not network latency. A symmetric 5-minute window accepts timestamps 5 minutes in the future, which is a much larger replay window than necessary.
                @bob 2026-02-11: Kimi is right. Asymmetric tolerance is standard practice. Stripe uses 5 minutes past, 0 future. We could use 5 minutes past, 30 seconds future (allows minor clock drift).
                  @alice 2026-02-12: 30 seconds future tolerance is reasonable. NTP-synced servers should be within 10ms, but cloud instances occasionally drift.
                    @ai:kimi-k2 2026-02-12: Agreed. The updated verification becomes: `verify(-300 < (now() - timestamp) < 30)`. This tightens the replay window from 600 seconds (symmetric) to 330 seconds (asymmetric) — a 45% reduction in attack surface.
                      @bob 2026-02-12: I want to amend to include the asymmetric window. But I set `amend: solo` on this change because the exact tolerance values are security-critical and I don't want drive-by amendments.
                        @carol 2026-02-12: That's fair. Submit a new `revised` event? Or should we supersede since it's the same author?
                          @bob 2026-02-12: Same author, so I'll just revise directly. The amend:solo allows self-revision.
    request-changes: @ai:kimi-k2 2026-02-11 "Should include asymmetric tolerance per discussion"
    request-changes: @alice 2026-02-12 "Waiting for Bob's revision with asymmetric window"
    revised @bob 2026-02-12: "5-minute (300-second)" → "5-minute (300-second past, 30-second future)" — asymmetric tolerance window per security review
      @alice 2026-02-12: Now it reads right. The asymmetric window is the correct security posture. One question: should the pseudocode be updated in the same change?
        @bob 2026-02-12: The pseudocode is in the surrounding section, not inside the CriticMarkup. I'll submit a separate change for the pseudocode update.
    approved: @alice 2026-02-12
    approved: @ai:kimi-k2 2026-02-12 "Asymmetric tolerance is correctly specified"
    open -- pseudocode update pending as separate change
