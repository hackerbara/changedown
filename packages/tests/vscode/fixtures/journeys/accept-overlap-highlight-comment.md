<!-- changedown.com/v1: tracked -->

# Overlap Accept Test

This paragraph has a {==highlighted phrase==}{>>This is a comment about the highlight<<} that should be accepted without error.

Here is {++an insertion++}[^cn-1] followed by normal text.

Here is {==another highlight==}{>>with attached comment<<} adjacent to each other.[^cn-2]

And a final paragraph with {++one more addition++}[^cn-3] to test bulk accept with mixed types.

[^cn-1]: @test-author | 2026-03-12 | ins | proposed
    @test-author 2026-03-12: Test insertion

[^cn-2]: @test-author | 2026-03-12 | hi | proposed
    @test-author 2026-03-12: Highlight with attached comment

[^cn-3]: @test-author | 2026-03-12 | ins | proposed
    @test-author 2026-03-12: Another insertion
