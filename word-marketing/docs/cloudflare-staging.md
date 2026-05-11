<!-- changedown.com/v1: tracked -->
# Cloudflare Pages staging — setup runbook

For T1.4 of the marketing-site plan. This is a manual step in the Cloudflare
dashboard; nothing in this repo can fully automate it.

## Project to create

| Field | Value |
|---|---|
| Project name | `changedown-com-staging` |
| Production branch | `main` (or `word-marketing-site` while in feature work) |
| Framework preset | None (custom) |
| Build command | `cd word-marketing && npm run build:marketing-only` |
| Build output directory | `word-marketing/dist` |
| Root directory | _(leave blank — Cloudflare clones the repo root)_ |
| Node version | 22 (matches root `.nvmrc` if present; otherwise latest LTS) |

**Why `build:marketing-only`:** the full `npm run build` script also builds the
Word add-in (`build:pane`) and copies its dist into `public/word/`. Staging
doesn't need the pane assets — we point the hosted manifest at production for
QA. The full build runs once we're ready to deploy production.

## Environment variables (project settings → Environment variables → Production)

| Name | Value | Notes |
|---|---|---|
| `PUBLIC_RELAY_BASE_URL` | `https://changedown-remote-relay-staging.hackerbara.workers.dev` | Existing staging relay; reuse |
| `PUBLIC_HOSTED_MANIFEST_URL` | `https://changedown-com-staging.pages.dev/word/manifest.hosted.xml` | Same project, `/word/` path |
| `PUBLIC_ANALYTICS_DOMAIN` | _(unset on staging)_ | Plausible disabled on staging to keep numbers clean |

## Preview deployments

Branch preview URLs follow the pattern
`https://<branch-name>.changedown-com-staging.pages.dev`. The
`word-marketing-site` branch will preview at
`https://word-marketing-site.changedown-com-staging.pages.dev`.

After T1.3's hello-world ships, hit that URL and confirm the page renders.
Once confirmed, paste the URL into `word-marketing/README.md` under "Preview
URLs."

## Custom domain (deferred to T10.10)

Do **not** bind `changedown.com` to this staging project. The production
cutover plan (T10.10) renames the staging project to `changedown-com` and
binds the domain in a single atomic dashboard session.

## Why a separate staging project rather than branch previews on production

When the production cutover happens (T10.10), the staging project becomes the
production project via rename. Keeping staging on its own project from day one
means the rename is a pure metadata change — no domain unbinding, no DNS
churn, no commits redirected mid-flight.

## What "done" looks like for T1.4

- [ ] Project created in Cloudflare dashboard
- [ ] Build succeeds on the first auto-deploy from `word-marketing-site` branch
- [ ] Preview URL renders `<h1>ChangeDown for Word — coming soon</h1>`
- [ ] Preview URL noted in `word-marketing/README.md`


[^cn-1]: ai:claude-opus-4.6 | 2026-05-11 | creation | proposed
    ai:claude-opus-4.6 2026-05-11T02:01:12Z: File created