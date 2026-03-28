<!-- changedown.com/v1: tracked -->

# Payment Gateway API Design

**Version:** 1.0
**Date:** 2026-02-20
**Author:** @human:alice
**Status:** Under Review
**Reviewers:** @ai:claude-sonnet-4-5, @ai:gemini-2.5-pro, @human:alice

## 1. Overview

The Payment Gateway API provides a unified interface for processing credit card transactions, managing refunds, and handling recurring billing. It serves as the single integration point between our platform and multiple payment processors (Stripe, Adyen, Braintree).

All API endpoints require authentication via OAuth 2.0 bearer tokens. Tokens are scoped to specific merchants and operations — a token with `payments:read` scope cannot initiate charges.

## 2. Core Endpoints

### 2.1 Create Payment

```
POST /api/v1/payments
```

Request body:

```json
{
  "amount": 4999,
  "currency": "USD",
  "payment_method": "pm_card_visa_4242",
  "merchant_id": "merch_abc123",
  "idempotency_key": "order_12345_attempt_1",
  "metadata": {
    "order_id": "order_12345",
    "customer_email": "user@example.com"
  }
}
```

Amounts are specified in the smallest currency unit (cents for USD, pence for GBP). The `idempotency_key` ensures that retried requests do not create duplicate charges — the server returns the original response for any repeated key within a {~~24-hour~>72-hour~~}[^cn-1] window.

{++All payment requests are validated against a fraud scoring model before processor submission. Requests with a fraud score above 0.85 are automatically declined with error code `fraud_risk_high`.++}[^cn-2]

### 2.2 Retrieve Payment

```
GET /api/v1/payments/:id
```

Returns the full payment object including status, processor response, and any associated refunds. Payment objects are retained for {--7 years to comply with PCI DSS data retention requirements. After 7 years, payment records are archived to cold storage and are no longer accessible via the API.--}[^cn-3]

### 2.3 List Payments

```
GET /api/v1/payments?merchant_id=merch_abc123&status=succeeded&limit=50
```

Supports filtering by `merchant_id`, `status`, `created_after`, `created_before`, and `currency`. Results are paginated using cursor-based pagination with a default page size of 20 and maximum of 100.

{~~The list endpoint returns payment summaries (id, amount, status, created_at) rather than full payment objects. Use the retrieve endpoint for complete details.~>The list endpoint returns full payment objects by default. Pass `fields=summary` to receive only id, amount, status, and created_at for faster responses.~~}[^cn-4]

### 2.4 Create Refund

```
POST /api/v1/payments/:id/refunds
```

{++Refunds are processed asynchronously. The endpoint returns a `refund_id` with status `pending`. Subscribe to the `refund.completed` webhook to be notified when the refund settles, typically within 5-10 business days depending on the processor and card network.++}[^cn-5]

Partial refunds are supported — specify an `amount` less than the original payment. Multiple partial refunds are allowed up to the original payment amount. Full refunds can be issued by omitting the `amount` field.

## 3. Authentication

### 3.1 Token Scopes

| Scope | Permissions |
|---|---|
| `payments:read` | List and retrieve payments |
| `payments:write` | Create payments and refunds |
| `merchants:read` | List and retrieve merchant profiles |
| `merchants:admin` | Update merchant settings, manage API keys |
| `webhooks:manage` | Create, update, delete webhook subscriptions |

{~~Tokens are issued with a 1-hour expiration and can be refreshed using a refresh token that expires after 30 days.~>Tokens are issued with a 15-minute expiration and cannot be refreshed. Clients must re-authenticate using client credentials for each session.~~}[^cn-6]

### 3.2 Rate Limiting

Rate limits are applied per merchant and per endpoint:

| Endpoint | Rate Limit | Window |
|---|---|---|
| `POST /payments` | 100 requests | Per second |
| `GET /payments/:id` | 500 requests | Per second |
| `GET /payments` | 50 requests | Per second |
| `POST /refunds` | 20 requests | Per second |

When a rate limit is exceeded, the API returns HTTP 429 with a `Retry-After` header indicating how many seconds to wait.

## 4. Error Handling

### 4.1 Error Response Format

All errors follow a consistent structure:

```json
{
  "error": {
    "code": "insufficient_funds",
    "message": "The card has insufficient funds to complete the transaction.",
    "param": "payment_method",
    "decline_code": "insufficient_funds",
    "request_id": "req_abc123"
  }
}
```

### 4.2 Error Categories

| HTTP Status | Category | Retryable |
|---|---|---|
| 400 | Invalid request | No |
| 401 | Authentication failure | No |
| 402 | Card declined | Depends on decline code |
| 404 | Resource not found | No |
| 409 | Idempotency conflict | No |
| 429 | Rate limit exceeded | Yes (after Retry-After) |
| 500 | Internal server error | Yes (with backoff) |
| 502 | Processor unavailable | Yes (with backoff) |

## 5. Webhooks

### 5.1 Event Types

{--The webhook system supports the following events:

- `payment.created` — A new payment has been initiated
- `payment.succeeded` — A payment was successfully captured
- `payment.failed` — A payment attempt failed
- `refund.created` — A refund has been initiated
- `refund.completed` — A refund has settled
- `dispute.opened` — A chargeback or dispute was filed
- `dispute.resolved` — A dispute was resolved (won or lost)--}[^cn-7]

{++The webhook system delivers events via HTTP POST to registered endpoints. Supported events:

- `payment.created` — A new payment has been initiated
- `payment.processing` — Payment sent to processor (new)
- `payment.succeeded` — A payment was successfully captured
- `payment.failed` — A payment attempt failed
- `payment.requires_action` — 3DS or SCA challenge required (new)
- `refund.created` — A refund has been initiated
- `refund.completed` — A refund has settled
- `dispute.opened` — A chargeback or dispute was filed
- `dispute.evidence_required` — Evidence submission deadline approaching (new)
- `dispute.resolved` — A dispute was resolved (won or lost)
- `payout.initiated` — Merchant payout started (new)
- `payout.completed` — Merchant payout settled (new)++}[^cn-7]

Webhook payloads include the full event object and are signed using HMAC-SHA256 with the endpoint's signing secret.

### 5.2 Retry Policy

Failed webhook deliveries are retried with exponential backoff: 1 minute, 5 minutes, 30 minutes, 2 hours, 24 hours. After 5 failed attempts, the endpoint is marked as disabled and an alert is sent to the merchant's configured notification email.

## 6. Migration Guide

### 6.1 Versioning Strategy

The API uses date-based versioning in the URL path (`/api/v1/`, `/api/v2/`). Breaking changes are introduced in new major versions only. Non-breaking additions (new fields, new optional parameters) are added to the current version.

{++Clients should include the `X-API-Version: 2026-02-01` header to pin their integration to a specific API snapshot. Without this header, the server uses the latest version, which will receive non-breaking additions over time.++}[^cn-8]

### 6.2 Deprecation Policy

Deprecated endpoints return a `Sunset` header with the retirement date and a `Deprecation` header with the deprecation date. Both dates are in HTTP-date format. Deprecated endpoints continue to function for a minimum of 12 months after the deprecation announcement.

SDK clients receive deprecation warnings as log messages when calling deprecated methods. The SDK checks for deprecation headers automatically and caches the result for the session lifetime.

## 7. Security Considerations

All communication uses TLS 1.3. The API does not support TLS 1.2 or earlier versions.

PCI DSS compliance is maintained by never logging or storing full card numbers. Only the last four digits and the card fingerprint are retained. Card data is tokenized at the edge before reaching the application layer.

IP allowlisting is available for merchant accounts that require it. When enabled, API requests from non-allowlisted IPs receive HTTP 403.

{~~Webhook signature verification uses HMAC-SHA256 with a per-endpoint secret key. The signature covers the raw request body and a timestamp to prevent replay attacks. Signatures expire after 5 minutes.~>Webhook signature verification uses Ed25519 with a per-endpoint public key. The signature covers the raw request body, the timestamp, and the webhook ID to prevent replay attacks. Signatures expire after 5 minutes. Ed25519 provides stronger security guarantees than HMAC while allowing signature verification without sharing a secret key.~~}[^cn-9]

[^cn-1]: @ai:gemini-2.5-pro | 2026-02-21 | sub | proposed
    @ai:gemini-2.5-pro 2026-02-21: Extended idempotency window from 24 hours to 72 hours. Payment retries often span multiple business days, especially for batch processing systems that run nightly. A 24-hour window is too narrow for weekend scenarios where a Friday batch failure is not retried until Monday.
    @human:alice 2026-02-22 [question]: Have we checked the storage impact? 72-hour idempotency keys at our current volume means ~18M keys in the cache at any time.
    @ai:gemini-2.5-pro 2026-02-22: Storage impact is minimal. Each key is ~120 bytes (key + response hash). At 18M entries, that's ~2.1 GB — well within the capacity of our Redis idempotency cluster which has 16 GB allocated.

[^cn-2]: @ai:claude-sonnet-4-5 | 2026-02-21 | ins | proposed
    @ai:claude-sonnet-4-5 2026-02-21: Added fraud scoring gate. This is critical for compliance — our processor agreement requires automated fraud screening before submission. The 0.85 threshold matches the false-positive rate analysis from Q4 2025.

[^cn-3]: @ai:gemini-2.5-pro | 2026-02-21 | del | proposed
    @ai:gemini-2.5-pro 2026-02-21: Removed data retention details. PCI DSS does not mandate 7-year retention for payment records — that is a tax/accounting requirement that varies by jurisdiction. Specifying a single retention period in the API docs is misleading. Retention policy should be documented in the compliance guide, not the API reference.

[^cn-4]: @ai:claude-sonnet-4-5 | 2026-02-21 | sub | proposed
    @ai:claude-sonnet-4-5 2026-02-21: Changed list endpoint to return full objects by default with an opt-in summary mode. Most integrations immediately call the retrieve endpoint after listing, resulting in N+1 queries. Returning full objects eliminates this pattern.
    @human:alice 2026-02-22 [issue]: Returning full objects by default is a performance concern. At scale (10K+ payments per merchant), this could return 50MB+ responses with the default page size. The original design was intentional — summaries first, details on demand.
    @ai:gemini-2.5-pro 2026-02-22: I agree with Alice. The N+1 concern is valid but the fix should be a `?expand=true` parameter, not changing the default. Breaking the default from summary to full is also a backwards-incompatible change for existing clients.

[^cn-5]: @human:alice | 2026-02-21 | ins | proposed
    @human:alice 2026-02-21: Added async refund documentation. The current docs imply refunds are synchronous, which causes confusion when integrators expect an immediate settlement.

[^cn-6]: @ai:gemini-2.5-pro | 2026-02-22 | sub | proposed
    @ai:gemini-2.5-pro 2026-02-22: Shortened token lifetime from 1 hour to 15 minutes and removed refresh tokens. Refresh tokens for payment APIs are a security anti-pattern — if a refresh token is compromised, the attacker has 30 days of access. Short-lived tokens with client credentials re-authentication are industry standard for payment processing (see Stripe, Adyen, Square APIs).

[^cn-7]: @ai:claude-sonnet-4-5 | 2026-02-21 | sub | proposed
    @ai:claude-sonnet-4-5 2026-02-21: Expanded webhook event list with processing, requires_action, evidence_required, and payout events. These are critical for complete payment lifecycle visibility. The substitution replaces the old list with a comprehensive one that includes delivery mechanism documentation.

[^cn-8]: @ai:claude-sonnet-4-5 | 2026-02-22 | ins | proposed
    @ai:claude-sonnet-4-5 2026-02-22: Added API version pinning via header. This is a standard practice (Stripe uses this exact pattern) that protects integrations from unexpected behavioral changes in non-breaking additions.

[^cn-9]: @ai:gemini-2.5-pro | 2026-02-22 | sub | proposed
    @ai:gemini-2.5-pro 2026-02-22: Switched webhook signatures from HMAC-SHA256 to Ed25519. Ed25519 signatures are asymmetric — the merchant only needs the public key to verify, eliminating the need to securely distribute and store shared secrets. This reduces the attack surface for webhook signature compromise.
    @human:alice 2026-02-23 [issue/blocking]: Ed25519 is not natively supported in most webhook verification libraries. Every merchant's existing HMAC-based verification code would break. We need a migration path — dual-signing during a transition period at minimum.
