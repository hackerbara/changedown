<!-- changedown.com/v1: tracked -->
# Pre-implementation decisions

Per plan `docs/superpowers/plans/2026-05-10-changedown-for-word-marketing-site.md` Tranche 0.

## Analytics (T0.1)

**Decision:** Plausible.

**Why.** Three candidates were considered: Plausible, Fathom, Umami. All three inject zero above-fold JS when configured with `<script defer>` — the only real differentiator at our scale is GDPR posture and operational simplicity.

**GDPR verification.** Plausible explicitly does not require a consent banner in the EU. Their published position: no cookies, no personal data collected, lawful interest basis, EU-hosted infrastructure. Source: `https://plausible.io/data-policy` (the page covers cookieless tracking, EU hosting in Germany, and the no-banner-required claim). Re-verify the wording against the live page before launch.

**Implementation.** Single `<script defer data-domain="changedown.com" src="https://plausible.io/js/script.js">` injected into `BaseLayout.astro` when `PUBLIC_ANALYTICS_DOMAIN` is set. The CSP in `_headers` (T10.2) is already configured to allow `https://plausible.io` under `script-src` and `connect-src`.

**If overridden later.** If we move to Fathom or self-hosted Umami, the only changes are:
1. The `<script>` URL in `BaseLayout.astro`
2. The CSP allow-list in `public/_headers`
3. This document

No telemetry calls are wired anywhere in product code; everything is config-driven.

## Voice guide (T0.2)

See `word-marketing/docs/voice-guide.md`. **Hard gate** before T3.x prose drafting and T10.5 writing pass.

## Mascot kickoff (T0.3)

See `word-marketing/docs/illustrator-brief.md`. Lead time ~2-3 weeks. Until artwork lands, all `<Mascot>` instances use placeholder SVGs marked `data-placeholder="true"`. T10.7 blocks on delivery.

## Plan errata

While executing the plan I found two real issues. Logging here so they're captured.

1. **Pane source path.** The plan and spec both reference `changedown-plugin/word-add-in/` for the Word add-in. Actual location is `packages/word-add-in/`. Fixes flow through `word-marketing/package.json` (`build:pane` script) and `word-marketing/scripts/copy-pane.sh` (T10.1).
2. **Pane copy mechanics.** The plan's `copy-pane.sh` is a naive `cp -r` of the pane `dist/`. The repo already has `scripts/build-word-pane-for-website.mjs` which handles hosted-base-URL injection and manifest URL rewriting — required for the AppSource hosted manifest at `changedown.com/word/manifest.hosted.xml` to resolve correctly. We reuse that script (or its substantive logic) rather than rolling a naive copy.


[^cn-1]: ai:claude-opus-4.6 | 2026-05-11 | creation | proposed
    ai:claude-opus-4.6 2026-05-11T01:58:10Z: File created