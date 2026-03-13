<!-- ctrcks.com/v1: tracked -->
# Save CriticMarkup Preservation Test

This document tests that CriticMarkup is preserved across save operations.

{++Rate limiting is enabled for all public endpoints.++}[^ct-1]

The authentication system uses {~~session cookies~>OAuth2 with JWT~~}[^ct-2] for security.

{--The legacy SOAP API will remain available indefinitely.--}[^ct-3]

Here is a {==highlighted section==}{>> This is review feedback <<}[^ct-4] to verify comments survive save.

[^ct-1]: @ai:claude | 2026-03-01 | ins | proposed
    Added rate limiting to prevent abuse

[^ct-2]: @ai:claude | 2026-03-01 | sub | proposed
    Upgraded authentication for better security

[^ct-3]: @ai:claude | 2026-03-01 | del | proposed
    SOAP is deprecated and unused

[^ct-4]: @ai:claude | 2026-03-01 | comment | proposed
    Review feedback on highlighted section
