# API Authentication Redesign

## Overview

This document proposes changes to our authentication system. The current implementation
uses {--session-based authentication with server-side cookies, which doesn't scale well
across our microservice architecture--}[^sc-1] and we're moving to {++a token-based
approach using JWT with short-lived access tokens and refresh token rotation++}[^sc-2].

The team has been {++discussing this change since Q3++} and the consensus is clear.

## Architecture Changes

### Token Structure

{==Each JWT will contain the user's role claims, tenant ID, and a unique session
identifier for audit logging.==}{>>This is the critical design decision — embedding
role claims means we don't need a separate authorization service lookup on every
request.<<}[^sc-3]

The access token lifetime is {~~30 minutes~>15 minutes~~}[^sc-4] to reduce the window
for stolen token misuse.

Refresh tokens will be stored in an {++HttpOnly, Secure, SameSite=Strict++} cookie
with a {~~7 day~>24 hour~~} rotation policy.

### Middleware Changes

The authentication middleware needs to:

1. Extract the JWT from the Authorization header
2. {--Validate against the session store--}[^sc-5]
3. {++Verify the JWT signature and expiration locally++}[^sc-6]
4. {++Check the token's `jti` claim against a revocation bloom filter++}
5. Populate the request context with {~~user session data~>decoded token claims~~}[^sc-7]

### Database Migration

We need to {--drop the `sessions` table entirely--} once all clients have migrated.
The migration script should:

- Back up existing session data
- {++Create the `refresh_tokens` table with columns: token_hash, user_id, expires_at, device_fingerprint, created_at++}[^sc-8]
- Add an index on `(user_id, expires_at)` for cleanup queries

{==The migration must be reversible for at least 30 days after deployment.==}{>>How do we handle rollback if the sessions table is dropped? We need a concrete plan here.<<}[^sc-9]

## Security Considerations

The move to JWT introduces {~~a few~>several well-documented~~} trade-offs:

1. **Token revocation** — JWTs are stateless, so {++we use a bloom filter for revocation
   checks rather than hitting the database on every request. The bloom filter is rebuilt
   every 5 minutes from the revocation table.++}[^sc-10]

2. **Token theft** — Short-lived tokens (15 min) limit the damage window. {--We should
   also consider certificate-bound tokens in a future iteration.--}

3. **Refresh token rotation** — Each refresh token is single-use. {++On rotation, the old
   token is invalidated immediately and a new refresh token is issued alongside the new
   access token.++}[^sc-11]

## Testing Plan

- Unit tests for token generation and verification
- Integration tests for the full auth flow
- {++Load testing with 10k concurrent token verifications to validate the bloom filter
  doesn't become a bottleneck++}[^sc-12]
- {--Manual QA of the login/logout flow--}

---

[^sc-1]: @alice | 2026-02-10T09:00:00Z | del | proposed
  Removing session-based auth description.

  @bob 2026-02-10T09:30:00Z: Are we sure we want to remove this entirely? It's useful context for why we're changing.
    @alice 2026-02-10T09:45:00Z: Good point — but the Architecture ADR already covers the rationale. Keeping it here duplicates.

[^sc-2]: @alice | 2026-02-10T09:00:00Z | ins | proposed
  Core architecture change — JWT with refresh rotation.

[^sc-3]: @bob | 2026-02-10T10:15:00Z | highlight | proposed
  suggestion: This design decision should be reviewed by the security team before we proceed.

[^sc-4]: @bob | 2026-02-10T10:30:00Z | sub | proposed
  Reducing token lifetime from 30min to 15min per security team recommendation.

[^sc-5]: @alice | 2026-02-10T11:00:00Z | del | proposed
  Session store validation is no longer needed with JWT.

[^sc-6]: @alice | 2026-02-10T11:00:00Z | ins | proposed
  Local JWT verification replaces session store lookup.

[^sc-7]: @bob | 2026-02-10T11:15:00Z | sub | proposed
  Token claims replace session data in request context.

[^sc-8]: @alice | 2026-02-10T14:00:00Z | ins | proposed
  New refresh_tokens table schema.

  @bob 2026-02-10T14:30:00Z: Should we add a `revoked_at` column instead of deleting rows?
    @alice 2026-02-10T14:45:00Z: Good idea — soft delete is better for audit trails. I'll update the schema.

  resolved @alice 2026-02-10T15:00:00Z: Updated schema to include revoked_at column.

[^sc-9]: @bob | 2026-02-10T14:15:00Z | highlight | proposed
  issue: Rollback strategy needs to be documented before this goes to production.

[^sc-10]: @alice | 2026-02-11T09:00:00Z | ins | proposed
  Bloom filter approach for token revocation.

[^sc-11]: @alice | 2026-02-11T09:30:00Z | ins | proposed
  Refresh token rotation mechanism.

[^sc-12]: @bob | 2026-02-11T10:00:00Z | ins | proposed
  Load testing requirement for bloom filter performance.
