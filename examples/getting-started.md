<!-- ctrcks.com/v1: tracked -->

# Project Status Update

**Last updated:** 2026-02-15
**Author:** @hackerbara

## Summary

This quarter we shipped the new notification system, migrated the database to PostgreSQL, and {++began planning the v2 API redesign++}[^sc-1]. The team is on track for the March milestone.

{--We are also evaluating a move to microservices, but no decision has been made yet.--}[^sc-2]

## Key Metrics

| Metric | Q4 2025 | Q1 2026 | Change |
|--------|---------|---------|--------|
| API latency (p99) | 240ms | 145ms[^sc-3] | -40% |
| Uptime | 99.92% | 99.97% | +0.05% |
| Active users | 12,400 | 14,800 | +19% |

## Next Steps

1. Finalize v2 API schema and publish draft RFC
2. Roll out PostgreSQL read replicas to US-East
3. {==Hire two senior engineers for the platform team==}{>>Is this confirmed? Last I heard, headcount was still pending finance approval.<<}[^sc-4]

---

**Try it yourself:** Turn on **Tracking** (dot icon in the title bar) and edit this document. Your changes will be wrapped automatically. Use **Alt+Cmd+Y** to accept and **Alt+Cmd+N[^sc-5]** to reject the changes above.

[^sc-1]: @ai:claude-sonnet-4-5 | 2026-02-15 | ins | proposed
    @ai:claude-sonnet-4-5 2026-02-15: Added the v2 API redesign to the summary since it was discussed in the Feb 12 planning meeting but missing from this doc.

[^sc-2]: @ai:claude-sonnet-4-5 | 2026-02-15 | del | proposed
    @ai:claude-sonnet-4-5 2026-02-15: Proposing removal. The microservices evaluation was shelved in January per @jordan's architecture review. Keeping it here is misleading.

[^sc-3]: @hackerbara | 2026-02-14 | sub | accepted
    approved: @jordan 2026-02-15 "Checked against the Grafana dashboard — 145ms is correct."
    @hackerbara 2026-02-14: Updated p99 latency. The 180ms figure was from the Jan snapshot; February's numbers landed at 145ms after the connection pooling fix.

[^sc-4]: @jordan | 2026-02-15 | highlight | proposed
    @jordan 2026-02-15: Is this confirmed? Last I heard, headcount was still pending finance approval.
    @hackerbara 2026-02-16: Good catch — it's approved but not yet in the system. I'll add a caveat.

[^sc-5]: @ai:claude-opus-4-6 | 2026-02-28 | sub | accepted
    @ai:claude-opus-4-6 2026-02-28: Update keybinding references to new Alt+Cmd scheme
    approved: @ai:claude-opus-4-6 2026-02-28 "Keybinding updated to match Alt+Cmd scheme from Task 2"