<!-- ctrcks.com/v1: tracked -->

# Accept/Reject Reason Test

This document tests accept and reject workflows with reason annotations.

The API now {++supports batch operations for bulk data imports++}[^ct-1] to improve throughput.

We decided to {--remove the deprecated v1 endpoint from the public API--}[^ct-2] as part of cleanup.

The retry logic uses {~~exponential backoff~>linear backoff with jitter~~}[^ct-3] for better reliability.

[^ct-1]: @alice | 2026-03-09 | ins | proposed
    @alice 2026-03-09T10:00:00Z: Adding batch operations for large dataset imports

[^ct-2]: @alice | 2026-03-09 | del | proposed
    @alice 2026-03-09T10:05:00Z: Removing deprecated endpoint per deprecation policy

[^ct-3]: @bob | 2026-03-09 | sub | proposed
    @bob 2026-03-09T10:10:00Z: Linear backoff with jitter reduces thundering herd effect
