<!-- changedown.com/v1: tracked -->
# @changedown/word-marketing

Marketing site for **ChangeDown for Word** — the Word task-pane add-in that
lets you bring any AI agent into your live Word document. Lives at
**[changedown.com](https://changedown.com)** in production. Built with
Astro 5 + a single Solid island for the interactive sandbox on the
homepage. Hand-rolled CSS in a warm-document editorial palette — no
Tailwind, no UI library, just tokens and intent.

For the developer / Markdown / VS Code surface, see
[`website-v2/`](../website-v2/), which moves to **changedown.dev** as part
of the same cutover.

## Local development

```bash
# From the repo root:
npm install                  # installs the workspace (once)

# From this directory:
npm run dev                  # astro dev — http://localhost:4321
npm run build:marketing-only # static build without the Word pane
npm run check                # astro check — types + content collections
npm test                     # vitest run
npm run test:e2e             # playwright test
```

## Build pipeline

```
npm run build:pane       → builds the Word add-in at packages/word-add-in/
                          → produces dist/ with manifest.hosted.xml + taskpane.html/js
astro build              → emits this site to ./dist/
npm run copy:pane        → copies the pane build into ./dist/word/
                          → rewrites manifest URLs to point at changedown.com
npm run build:og         → generates OG card PNGs into ./public/og/
```

A single Cloudflare Pages deploy serves the marketing site at `/` and the
Word pane assets at `/word/*` — the URL referenced by the hosted manifest
distributed via AppSource.

## Preview URLs

| Branch | URL |
|---|---|
| `word-marketing-site` | _(populated after T1.4 staging is set up — see docs/cloudflare-staging.md)_ |
| `main` (post-merge) | _(populated after Cloudflare project bound to main)_ |
| production | `https://changedown.com` _(post-T10.10 cutover)_ |

## Repo orientation

- [`docs/voice-guide.md`](./docs/voice-guide.md) — voice for all writing on
  this site. Hard gate before any prose drafting.
- [`docs/decisions.md`](./docs/decisions.md) — pre-implementation decisions
  (analytics, plan errata).
- [`docs/illustrator-brief.md`](./docs/illustrator-brief.md) — capybara
  mascot brief sent to illustrator.
- [`docs/cloudflare-staging.md`](./docs/cloudflare-staging.md) — staging
  project setup runbook.

The plan that drives this work lives at
[`docs/superpowers/plans/2026-05-10-changedown-for-word-marketing-site.md`](../docs/superpowers/plans/2026-05-10-changedown-for-word-marketing-site.md).
The design spec lives at
[`docs/superpowers/specs/2026-05-10-changedown-for-word-marketing-site-design.md`](../docs/superpowers/specs/2026-05-10-changedown-for-word-marketing-site-design.md).


[^cn-1]: ai:claude-opus-4.6 | 2026-05-11 | creation | proposed
    ai:claude-opus-4.6 2026-05-11T02:01:23Z: File created