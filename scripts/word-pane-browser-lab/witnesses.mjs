import { sanitizeJson, sanitizeUrl } from './redact.mjs';

export function installBrowserWitnesses(page) {
  const consoleMessages = [];
  const pageErrors = [];
  const requests = [];
  const responses = [];

  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text().slice(0, 1000) });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') });
  });
  page.on('request', (req) => {
    requests.push({ method: req.method(), url: sanitizeUrl(req.url()), resourceType: req.resourceType() });
  });
  page.on('response', (res) => {
    responses.push({ status: res.status(), url: sanitizeUrl(res.url()) });
  });

  return {
    snapshot() {
      return sanitizeJson({ consoleMessages, pageErrors, requests, responses });
    },
  };
}

export function summarizeBrowserWitness(browser) {
  const consoleMessages = browser?.consoleMessages ?? [];
  return {
    consoleMessageCount: consoleMessages.length,
    consoleErrorCount: consoleMessages.filter((msg) => msg.type === 'error').length,
    consoleWarningCount: consoleMessages.filter((msg) => msg.type === 'warning').length,
    pageErrorCount: browser?.pageErrors?.length ?? 0,
    requestCount: browser?.requests?.length ?? 0,
    responseCount: browser?.responses?.length ?? 0,
  };
}

export function classifyPaneConnectionState(paneState, expected) {
  const actual = paneState?.state?.connection;
  return actual === expected ? 'converged' : 'ui-only';
}

export async function capturePaneState(page) {
  return sanitizeJson(await page.evaluate(() => {
    const harness = globalThis.__cdHarness;
    if (!harness) return { available: false };
    const text = document.body.innerText.slice(0, 4000);
    const connectionDot = document.querySelector('.cd-header__dot, .cd-session-strip .cd-dot');
    const welcome = document.querySelector('.cd-welcome');
    const welcomeClass = welcome?.className ?? '';
    const remoteRoomMode = text.includes('A seat is')
      ? 'remote-connected'
      : text.includes('All seats taken')
        ? 'remote-unavailable'
        : text.includes('Remote room connection failed')
          ? 'remote-error'
          : 'local';
    return {
      available: true,
      url: globalThis.location.href,
      state: harness.getPaneState(),
      connectionDotClass: connectionDot?.className,
      ui: {
        welcomeClass,
        welcomeName: welcomeClass.includes('--handoff')
          ? 'handoff'
          : welcomeClass.includes('--all-full')
            ? 'all-slots-full'
            : welcomeClass.includes('--network-error')
              ? 'network-error'
              : welcomeClass.includes('--default')
                ? 'default'
                : null,
        remoteRoomMode,
        outsideRemoteVisible: text.includes('cloud-room') || text.includes('@ai:cloud-room'),
      },
      text,
      buttons: Array.from(document.querySelectorAll('button')).map((button) => button.textContent?.trim()).filter(Boolean),
    };
  }));
}

export async function captureBrowserWitness({ page, artifacts, witness, phase }) {
  const pane = await capturePaneState(page);
  const browser = witness.snapshot();
  await artifacts.writeJson(`${phase}/pane-state.json`, pane);
  await artifacts.writeJson(`${phase}/browser.json`, browser);
  await page.screenshot({ path: artifacts.pathFor(`${phase}/screenshot.png`), fullPage: true });
  return { pane, browser, screenshot: `${phase}/screenshot.png` };
}
