#!/usr/bin/env node
/**
 * copy-pane.mjs — copies packages/word-add-in/dist into word-marketing/dist/word/
 * with hosted-URL rewriting.
 *
 * Mirrors the pattern of scripts/build-word-pane-for-website.mjs (which targets
 * website-v2/public/word/). This script targets word-marketing/dist/word/ so that
 * Cloudflare Pages picks up the pane assets at /word/* on changedown.com.
 *
 * Env vars (all optional; defaults assume production changedown.com):
 *   CHANGEDOWN_WORD_HOSTED_BASE_URL         — e.g. https://changedown.com/word/
 *   CHANGEDOWN_WORD_HOSTED_MANIFEST_VERSION — e.g. 1.0.3.0
 *   CHANGEDOWN_WORD_REMOTE_RELAY_ORIGIN     — e.g. https://changedown-remote-relay-staging.hackerbara.workers.dev
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// word-marketing/scripts/ → word-marketing/ → repo root
const marketingDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(marketingDir, "..");

const wordAddInDir = path.join(repoRoot, "packages", "word-add-in");
const wordAddInDist = path.join(wordAddInDir, "dist");
const targetDir = path.join(marketingDir, "dist", "word");

// ── env vars ──────────────────────────────────────────────────────────────────

const hostedBaseUrl = normalizeBaseUrl(
  process.env.CHANGEDOWN_WORD_HOSTED_BASE_URL ?? "https://changedown.com/word/",
);
const hostedManifestVersion =
  process.env.CHANGEDOWN_WORD_HOSTED_MANIFEST_VERSION ?? "1.0.3.0";
const hostedOrigin = new URL(hostedBaseUrl).origin;
const devPaneOrigin = "https://127.0.0.1:3000";
const loopbackOrigin = "https://127.0.0.1:39990";
const remoteRelayOrigin =
  process.env.CHANGEDOWN_WORD_REMOTE_RELAY_ORIGIN ??
  "https://changedown-remote-relay-staging.hackerbara.workers.dev";

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error(`Hosted Word pane base URL must be https: ${value}`);
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

function assertExists(p, label) {
  if (!existsSync(p)) {
    throw new Error(`${label} not found: ${p}\nRun 'npm run build:pane' first.`);
  }
}

// ── manifest generation (same logic as root script) ──────────────────────────

function generateHostedManifest() {
  const srcManifest = path.join(wordAddInDir, "manifest.xml");
  const destManifest = path.join(wordAddInDir, "manifest.hosted.xml");
  assertExists(srcManifest, "manifest.xml");

  let manifest = readFileSync(srcManifest, "utf8");

  manifest = manifest.replaceAll(`${devPaneOrigin}/`, hostedBaseUrl);
  manifest = manifest.replace(
    /<Version>.*?<\/Version>/,
    `<Version>${hostedManifestVersion}</Version>`,
  );
  manifest = manifest.replace(
    /<AppDomains>[\s\S]*?<\/AppDomains>/,
    `<AppDomains>\n    <AppDomain>${hostedOrigin}</AppDomain>\n    <AppDomain>${loopbackOrigin}</AppDomain>\n  </AppDomains>`,
  );
  manifest = manifest.replace(
    /AppDomains: origins[\s\S]*?-->/,
    `AppDomains: origins the Word WebView is allowed to navigate to / load\n    assets from.\n      - ${hostedOrigin} — hosted static task pane origin\n      - ${loopbackOrigin} — the changedown-mcp fixed-port HTTPS loopback endpoint the\n        pane registers with. See docs/superpowers/plans/2026-04-21-word-sidebar-03b-pane-backend-client.md.\n  -->`,
  );

  validateHostedManifest(manifest);
  writeFileSync(destManifest, manifest);
  console.log(`  Generated packages/word-add-in/manifest.hosted.xml`);
  return manifest;
}

function generateRemoteManifest(hostedManifest) {
  const destManifest = path.join(wordAddInDir, "manifest.remote.xml");
  let manifest = hostedManifest;

  manifest = manifest.replaceAll(
    `${hostedBaseUrl}taskpane.html`,
    `${hostedBaseUrl}taskpane.html?changedownMode=remote`,
  );
  manifest = manifest.replace(
    /<AppDomains>[\s\S]*?<\/AppDomains>/,
    `<AppDomains>\n    <AppDomain>${hostedOrigin}</AppDomain>\n    <AppDomain>${remoteRelayOrigin}</AppDomain>\n  </AppDomains>`,
  );
  manifest = manifest.replace(
    /AppDomains: origins[\s\S]*?-->/,
    `Remote-only public-room install manifest.\n    This variant is for shell-only sideloading from changedown.com/word/install-*.\n    It intentionally does not declare the loopback MCP origin. The pane opens in\n    remote-room mode and talks only to the hosted relay over HTTPS/WSS.\n  -->`,
  );

  validateRemoteManifest(manifest);
  writeFileSync(destManifest, manifest);
  console.log(`  Generated packages/word-add-in/manifest.remote.xml`);
}

// ── validation (mirrors root script exactly) ──────────────────────────────────

function validateHostedManifest(manifest) {
  const required = [
    `${hostedBaseUrl}taskpane.html`,
    `${hostedBaseUrl}commands.html`,
    `${hostedBaseUrl}assets/icon-16.png?v=capybara-1`,
    `${hostedBaseUrl}assets/icon-32.png?v=capybara-1`,
    `${hostedBaseUrl}assets/icon-64.png?v=capybara-1`,
    `${hostedBaseUrl}assets/icon-80.png?v=capybara-1`,
    `<Version>${hostedManifestVersion}</Version>`,
    `<AppDomain>${hostedOrigin}</AppDomain>`,
    `<AppDomain>${loopbackOrigin}</AppDomain>`,
  ];
  const missing = required.filter((needle) => !manifest.includes(needle));
  if (missing.length > 0) {
    throw new Error(`Hosted manifest missing expected values:\n${missing.join("\n")}`);
  }
  if (manifest.includes(devPaneOrigin)) {
    throw new Error(`Hosted manifest still references dev pane origin ${devPaneOrigin}`);
  }

  const appDomainsMatch = manifest.match(/<AppDomains>([\s\S]*?)<\/AppDomains>/);
  if (!appDomainsMatch) throw new Error("Hosted manifest is missing AppDomains");
  const appDomains = [
    ...appDomainsMatch[1].matchAll(/<AppDomain>(.*?)<\/AppDomain>/g),
  ].map((m) => m[1]);
  for (const domain of appDomains) {
    const normalizedOrigin = new URL(domain).origin;
    if (domain !== normalizedOrigin) {
      throw new Error(
        `AppDomain must be an exact origin with no path or trailing slash: ${domain}`,
      );
    }
  }
}

function validateRemoteManifest(manifest) {
  const required = [
    `${hostedBaseUrl}taskpane.html?changedownMode=remote`,
    `${hostedBaseUrl}commands.html`,
    `${hostedBaseUrl}assets/icon-16.png?v=capybara-1`,
    `${hostedBaseUrl}assets/icon-32.png?v=capybara-1`,
    `${hostedBaseUrl}assets/icon-64.png?v=capybara-1`,
    `${hostedBaseUrl}assets/icon-80.png?v=capybara-1`,
    `<Version>${hostedManifestVersion}</Version>`,
    `<AppDomain>${hostedOrigin}</AppDomain>`,
    `<AppDomain>${remoteRelayOrigin}</AppDomain>`,
  ];
  const missing = required.filter((needle) => !manifest.includes(needle));
  if (missing.length > 0) {
    throw new Error(`Remote manifest missing expected values:\n${missing.join("\n")}`);
  }
  for (const forbidden of [devPaneOrigin, loopbackOrigin, "http://127.0.0.1", "https://127.0.0.1"]) {
    if (manifest.includes(forbidden)) {
      throw new Error(`Remote manifest must not reference ${forbidden}`);
    }
  }
}

function validateBuiltTarget(dir) {
  const required = [
    "taskpane.html",
    "commands.html",
    "manifest.hosted.xml",
    "manifest.remote.xml",
    "assets/icon-16.png",
    "assets/icon-32.png",
    "assets/icon-64.png",
    "assets/icon-80.png",
  ];
  const missing = required.filter((f) => !existsSync(path.join(dir, f)));
  if (missing.length > 0) {
    throw new Error(`Target dir missing expected files:\n${missing.join("\n")}`);
  }

  const hostedManifest = readFileSync(path.join(dir, "manifest.hosted.xml"), "utf8");
  validateHostedManifest(hostedManifest);

  const remoteManifest = readFileSync(path.join(dir, "manifest.remote.xml"), "utf8");
  validateRemoteManifest(remoteManifest);

  const taskpaneHtml = readFileSync(path.join(dir, "taskpane.html"), "utf8");
  if (taskpaneHtml.includes(devPaneOrigin)) {
    throw new Error(`dist/word/taskpane.html still references ${devPaneOrigin}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log("copy-pane: copying packages/word-add-in/dist → word-marketing/dist/word/");
console.log(`  hostedBaseUrl:          ${hostedBaseUrl}`);
console.log(`  hostedManifestVersion:  ${hostedManifestVersion}`);
console.log(`  remoteRelayOrigin:      ${remoteRelayOrigin}`);
console.log();

// Guard: dist must exist (i.e. build:pane already ran)
assertExists(wordAddInDist, "packages/word-add-in/dist");
assertExists(path.join(wordAddInDist, "taskpane.html"), "packages/word-add-in/dist/taskpane.html");

// Step 1: generate manifests into the source package (same as root script)
console.log("Generating hosted manifests…");
const hostedManifest = generateHostedManifest();
generateRemoteManifest(hostedManifest);

// Step 2: clean + recreate target dir
console.log(`\nCleaning ${path.relative(repoRoot, targetDir)}`);
rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });

// Step 3: copy dist → target (skip source maps)
let filesCopied = 0;
console.log(`Copying dist → ${path.relative(repoRoot, targetDir)}`);
cpSync(wordAddInDist, targetDir, {
  recursive: true,
  filter(source) {
    if (source.endsWith(".map")) return false;
    filesCopied++;
    return true;
  },
});

// Step 4: validate the target
console.log("\nValidating target…");
validateBuiltTarget(targetDir);

// Step 5: summary
console.log("\ncopy-pane complete:");
console.log(`  ${path.relative(repoRoot, targetDir)}/taskpane.html`);
console.log(`  ${path.relative(repoRoot, targetDir)}/manifest.hosted.xml`);
console.log(`  ${path.relative(repoRoot, targetDir)}/manifest.remote.xml`);
console.log(`  Files copied: ~${filesCopied}`);
console.log(`  Hosted manifest URL: ${hostedBaseUrl}manifest.hosted.xml`);
console.log(`  Remote install:      ${hostedBaseUrl}install-mac.sh`);
