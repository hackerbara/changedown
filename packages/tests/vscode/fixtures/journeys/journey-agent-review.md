# API Design Document

The API uses {~~REST~>GraphQL~~}[^cn-1] for the public interface.
Authentication uses {~~API keys~>OAuth2 with JWT~~}[^cn-2] for all endpoints.
{++Rate limiting is set to 1000 requests per minute.++}[^cn-3]
{--Legacy XML support is maintained.--}[^cn-4]

## Caching

The system uses {~~no caching~>Redis caching with 5-minute TTL~~}[^cn-5] for performance.

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
  Reduce database load under high traffic
