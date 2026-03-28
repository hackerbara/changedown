# API Design Notes

The authentication endpoint {++now supports OAuth 2.0 tokens in addition to++}[^cn-1] API keys for all client requests.

Rate limiting {--should be disabled for internal services that--}[^cn-2] applies to external consumers only.

The response format uses {~~XML payloads~>JSON with pagination metadata~~}[^cn-3] for collection endpoints.

{==The caching strategy needs review before the v2 launch.==}{>>Redis vs Memcached? Let's benchmark both.<<}[^cn-4]

<!-- changedown.com/v1: tracked -->

[^cn-1]: @alice | 2026-03-05 | ins | proposed
    @alice 2026-03-05: OAuth 2.0 support per security audit recommendation

[^cn-2]: @bob | 2026-03-06 | del | proposed
    @bob 2026-03-06: Internal services should still respect rate limits

[^cn-3]: @alice | 2026-03-06 | sub | proposed
    @alice 2026-03-06: XML is deprecated, moving to JSON per API v2 spec

[^cn-4]: @sarah | 2026-03-07 | hl | proposed
    @sarah 2026-03-07: Need benchmark data before committing to caching strategy
