# API Design Document

The API uses {~~REST~>{~~GraphQL~>GraphQL (note: {++ and {-- are markup delimiters)~~}[^cn-24]~~}[^cn-1] for the public interface.
Authentication uses {~~API keys~>OAuth2 with JWTs (JSON Web Tokens) for enhanced security and auditability~~}[^cn-25]~~}[^cn-2] for all endpoints.
{++Rate limiting is set to 1000 requests per minute.++}[^cn-3]
{--Legacy XML support is {~~maintained~>obsolete~~}[^cn-27].--}[^cn-4]

## {~~Caching~>Cache Management Strategy\n\nThis section covers all caching mechanisms used throughout the platform, including edge, application, and distributed caches.~~}[^cn-26]

{~~The system uses {~~no caching~>Redis caching with 5-minute TTL~~}[^cn-5] for performance.~>The system uses Redis caching with 5-minute TTL and LRU eviction for performance.~~}[^cn-28]~>Redis caching with 5-minute TTL~~}[^cn-5] for performance.

[^cn-1]: @ai:claude | 2026-02-10T09:00:00Z | sub | proposed
  GraphQL gives clients query flexibility
  @ai:reviewer 2026-02-10T10:00:00Z [question]: Have you considered the learning curve?
    @ai:claude 2026-02-10T11:00:00Z: Most modern teams are familiar with GraphQL

[^cn-2]: @ai:claude | 2026-02-10T09:01:00Z | sub | accepted
  Security upgrade from plain API keys
  approved: @human:alice 2026-02-10

[^cn-3]: @ai:drafter | 2026-02-10T09:02:00Z | ins | proposed
  Prevent API abuse

[^cn-4]: @ai:claude | 2026-02-10T09:03:00Z | del | proposed
  XML is no longer used by any client

[^cn-5]: @ai:claude | 2026-02-10T09:04:00Z | sub | proposed

[^cn-24]: @ai:claude-haiku-4-5 | 2026-02-20 | sub | proposed
    @ai:claude-haiku-4-5 2026-02-20: Testing CriticMarkup delimiters in new text
    @ai:claude-haiku-4-5 2026-02-20: First thread response
    @ai:claude-haiku-4-5 2026-02-20 [question]: Is this correct?

[^cn-25]: @ai:claude-haiku-4-5 | 2026-02-20 | sub | proposed
    @ai:claude-haiku-4-5 2026-02-20: This is a very long reasoning text that exceeds 500 characters to stress test the plugin's ability to handle verbose explanations. When API credentials are stored, they should follow modern cryptographic standards including JWTs (JSON Web Tokens) which provide strong, verifiable authentication mechanisms that are superior to simple API keys. JWTs include built-in expiration, can be revoked more easily, support multi-factor authentication flows, and provide better audit trails. Additionally, OAuth2 with JWTs enables scoped permissions at a finer granularity than basic API keys, allowing different services and users to have exactly the permissions they need without over-privileging. This principle of least privilege is fundamental to security architecture. Furthermore, JWTs can include additional claims about the authenticated entity (user, service, etc.) without requiring a database lookup, reducing latency. The move from OAuth2 with basic JWTs to a more comprehensive token strategy is essential for enterprise-grade API security.
    revised @ai:claude-haiku-4-5 2026-02-20: Improved wording: made it more concise while emphasizing auditability
    previous: "{~~OAuth2 with JWT~>OAuth2 with JWTs for enhanced security"
    @ai:claude-haiku-4-5 2026-02-20: Second thread response
    @ai:claude-haiku-4-5 2026-02-20 [issue]: This might have an issue

[^cn-26]: @ai:claude-haiku-4-5 | 2026-02-20 | sub | proposed
    @ai:claude-haiku-4-5 2026-02-20: Expanding section heading with detailed description spanning multiple lines
    @ai:claude-haiku-4-5 2026-02-20 [praise]: This is a good expansion

[^cn-27]: @ai:claude-haiku-4-5 | 2026-02-20 | sub | proposed
    @ai:claude-haiku-4-5 2026-02-20 [suggestion]: Consider refactoring this

[^cn-28]: @ai:claude-sonnet-4-6 | 2026-02-20 | sub | proposed
    @ai:claude-sonnet-4-6 2026-02-20: Initial draft: the caching line needs to reflect the settled state (Redis with TTL) and add eviction policy specification.
  Reduce database load under high traffic
