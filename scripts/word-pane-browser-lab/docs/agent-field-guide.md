# Word Pane Browser Goblin Lab Agent Field Guide

Date: 2026-05-09

## Purpose

The browser Goblin lab runs the production Word pane bundle in Chromium with a mocked Office runtime. It is for pane UI, local MCP transport, browser/CDP exploration, and remote relay UX investigation. It does not prove native Microsoft Word mutation; use `scripts/word-live-lab.mjs` for native Word proof.

## Main commands

```bash
node scripts/word-pane-browser-lab.mjs lab --backend mocked --cdp-port 9223
node scripts/word-pane-browser-lab.mjs run pane-loads-harness --backend mocked
node scripts/word-pane-browser-lab.mjs run local-bridge-state --backend real-local-mcp
node scripts/word-pane-browser-lab.mjs run remote-claim-waiting remote-copy-invite --backend mocked-relay
node scripts/word-pane-browser-lab.mjs report latest
npm run test:word-pane-browser-lab
```

## Interactive/CDP mode

`lab` mode holds Chromium open and writes a handoff file with the page URL, backend, fixture, artifact directory, and CDP endpoint.

```bash
node scripts/word-pane-browser-lab.mjs lab --backend mocked-relay --fixture threeParasClean --cdp-port 9223
```

The owning terminal is responsible for cleanup. Type `help` for interactive commands, `screenshot <name>` for evidence, and `exit` to close the browser.

## Evidence rules

Raw artifacts live under `docs/findings/word-pane-browser-harness/` and are ignored. Commit curated findings only.

Never commit raw:

- `cdr2.` tokens;
- bearer tokens;
- full invite packets;
- request or response bodies from live relay;
- full DOM dumps with token-bearing attributes;
- local filesystem paths.

The artifact writer redacts JSON/transcripts/summaries, but generated screenshots are still raw visual evidence and must remain ignored unless manually reviewed and sanitized.

## Classification reminders

- `converged`: UI, pane state, and backend/relay witness agree.
- `loaded-reconnecting`: the pane rendered, but transport health did not prove connected.
- `bridge-reconnecting`: local bridge was present but not healthy/connected yet.
- `presence-too-eager`: outside-agent presence appeared before remote activity.
- `copy-inconclusive`: visible copy affordance did not produce a valid clipboard invite shape.
- `release-attempted-not-restored`: release was called but the pane did not return to local connected state.
- `privacy-leak`: artifact capture or UI persisted raw token/body/path/query material where only shape evidence should appear.
- `inconclusive`: evidence is insufficient; do not upgrade without a new run.

## Backend modes

- `mocked`: existing browser harness mocked MCP mode.
- `real-local-mcp`: existing browser harness real MCP mode.
- `mocked-relay`: route-mocked claim/release plus fake relay WebSocket. This proves pane UI and WebSocket-mode behavior, not Worker/Durable Object behavior.
- `local-worker-relay`: reserved future explicit local Wrangler path.
- `staging-relay`: reserved future opt-in live path requiring `--allow-live-relay`.

## Current known finding

The mocked backend can still classify local transport as `loaded-reconnecting` or `bridge-reconnecting` because its SSE stub intentionally closes. Use `real-local-mcp` for true connected local-bridge proof.

`remote-release-restores-local` should converge in mocked-relay mode. It verifies that the release POST was attempted and the handoff UI returned to the local “Try a free slot” state.
