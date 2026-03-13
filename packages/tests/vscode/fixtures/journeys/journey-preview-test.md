# Preview Integration Test

This document verifies that the markdown preview renders CriticMarkup correctly.

The API now includes {++an important addition for rate limiting++}[^ct-1] to protect endpoints.

The transport layer uses {~~REST~>GraphQL~~}[^ct-2] for the public interface.

{--Legacy XML support has been removed from the codebase.--}[^ct-3]

The documentation was {==carefully reviewed==}{>>needs final sign-off<<} before release.

[^ct-1]: @ai:claude | 2026-02-15T09:00:00Z | ins | accepted
  Rate limiting prevents API abuse under high load
  approved: @human:alice 2026-02-15
  @ai:reviewer 2026-02-15T10:00:00Z [question]: What is the rate limit threshold?
    @ai:claude 2026-02-15T11:00:00Z: 1000 requests per minute per client

[^ct-2]: @ai:claude | 2026-02-15T09:01:00Z | sub | accepted
  GraphQL provides better query flexibility for clients
  approved: @human:bob 2026-02-15

[^ct-3]: @ai:claude | 2026-02-15T09:02:00Z | del | rejected
  XML is still used by two legacy integrations
  rejected: @human:alice 2026-02-15 "legacy partners depend on it"
