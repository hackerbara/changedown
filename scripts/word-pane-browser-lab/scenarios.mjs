import { importWordFixtures, launchBrowserHarness } from './harness-driver.mjs';
import { captureBrowserWitness, classifyPaneConnectionState, installBrowserWitnesses, summarizeBrowserWitness } from './witnesses.mjs';
import { inviteShape, sanitizeJson } from './redact.mjs';

async function withHarness(ctx, fn) {
  let harness;
  let result;
  let witness;
  try {
    const userBeforeNavigate = ctx.beforeNavigate;
    harness = await launchBrowserHarness({
      ...ctx,
      beforeNavigate: async (page, context) => {
        witness = installBrowserWitnesses(page);
        if (userBeforeNavigate) await userBeforeNavigate(page, context);
      },
    });
    result = await fn({ ...ctx, harness, witness });
    return result;
  } catch (err) {
    result = {
      classification: 'inconclusive',
      reason: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    };
    return result;
  } finally {
    if (ctx.preserveOnFailure && result?.classification !== 'converged') {
      await new Promise(() => undefined);
    }
    if (ctx.holdOpenMs > 0) await new Promise((resolve) => setTimeout(resolve, ctx.holdOpenMs));
    await harness?.shutdown?.();
  }
}

export function classifyPaneLoadHarness(paneState, pageErrorCount) {
  const connection = paneState?.state?.connection;
  if (!paneState?.available || pageErrorCount !== 0) return 'inconclusive';
  if (connection === 'connected') return 'converged';
  if (connection === 'reconnecting') return 'loaded-reconnecting';
  return 'inconclusive';
}

async function bootFixture(harness, fixtureName) {
  const fixtures = await importWordFixtures();
  const fixture = fixtures[fixtureName];
  if (!fixture) throw new Error(`Unknown fixture: ${fixtureName}`);
  await harness.bootWithFixture(fixture);
  return fixtureName;
}

async function paneLoadsHarness(ctx) {
  return withHarness(ctx, async ({ harness, artifacts, witness }) => {
    await bootFixture(harness, ctx.fixture);
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-loaded' });
    const state = captured.pane;
    const pageErrorCount = captured.browser.pageErrors?.length ?? 0;
    const classification = classifyPaneLoadHarness(state, pageErrorCount);
    const result = {
      classification,
      pageUrl: harness.page.url(),
      harnessAvailable: state.available,
      connection: state.state?.connection,
      connectionDotClass: state.connectionDotClass,
      cardCount: state.state?.cards?.length ?? 0,
      pageErrorCount,
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}



export function classifyLocalBridgeState(paneState) {
  const connection = paneState?.state?.connection;
  if (connection === 'connected') return 'converged';
  if (connection === 'reconnecting') return 'bridge-reconnecting';
  if (connection === 'failed') return 'bridge-failed';
  return classifyPaneConnectionState(paneState, 'connected');
}

async function localBridgeState(ctx) {
  return withHarness(ctx, async ({ harness, artifacts, witness }) => {
    await bootFixture(harness, ctx.fixture);
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-local-bridge' });
    const connection = captured.pane.state?.connection;
    const classification = classifyLocalBridgeState(captured.pane);
    const result = {
      classification,
      backend: ctx.backend,
      connection,
      connectionDotClass: captured.pane.connectionDotClass,
      pageUrl: harness.page.url(),
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

async function clickButtonByText(page, text) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(escaped, 'i');
  const roleButton = page.getByRole('button', { name: matcher }).first();
  if (await roleButton.count()) {
    await roleButton.click({ timeout: 5_000 });
    return;
  }
  await page.getByText(matcher).first().click({ timeout: 5_000 });
}

async function waitForPaneText(page, text, timeout = 8_000) {
  await page.waitForFunction(
    (needle) => document.body.innerText.includes(needle),
    text,
    { timeout },
  );
}

async function installClipboardProbe(page) {
  return page.evaluate(() => {
    const writes = [];
    const clipboard = {
      async writeText(text) {
        writes.push(String(text));
      },
    };
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: clipboard,
      });
      globalThis.__cdClipboardWrites = writes;
      return { installed: true };
    } catch (err) {
      globalThis.__cdClipboardWrites = writes;
      return { installed: false, reason: err instanceof Error ? err.message : String(err) };
    }
  });
}

async function claimRemoteRoom(ctx, extra = {}) {
  return withHarness({ ...ctx, backend: 'mocked-relay', ...extra }, async ({ harness, artifacts, witness }) => {
    await clickButtonByText(harness.page, 'Try a free slot');
    await waitForPaneText(harness.page, 'A seat is');
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-remote-claimed' });
    const relayCalls = harness.relayMock?.calls ?? [];
    await harness.relayMock?.writeArtifacts?.();
    const ui = captured.pane.ui;
    const classification = ui?.remoteRoomMode === 'remote-connected' && ui?.welcomeName === 'handoff'
      ? 'converged'
      : 'ui-only';
    const result = {
      classification,
      roomMode: ui?.remoteRoomMode,
      roomId: captured.pane.text.match(/\bpublic-[1-5]\b/)?.[0],
      welcomeName: ui?.welcomeName,
      relayCallCount: relayCalls.length,
      relayCalls: sanitizeJson(relayCalls),
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

async function remoteClaimWaiting(ctx) {
  return claimRemoteRoom(ctx);
}

async function remoteCopyInvite(ctx) {
  return withHarness({ ...ctx, backend: 'mocked-relay' }, async ({ harness, artifacts, witness }) => {
    const clipboardProbe = await installClipboardProbe(harness.page);
    await clickButtonByText(harness.page, 'Try a free slot');
    await waitForPaneText(harness.page, 'Copy agent instructions');
    const invite = await harness.page.evaluate(async () => {
      const preview = document.querySelector('.cd-welcome__preview-pre')?.textContent ?? '';
      const copyButton = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Copy agent instructions'));
      if (copyButton instanceof HTMLButtonElement) copyButton.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const roomLink = document.querySelector('.cd-welcome__session-url')?.textContent ?? '';
      const clipboardWrites = globalThis.__cdClipboardWrites ?? [];
      return {
        preview,
        roomLink,
        copyButtonText: copyButton?.textContent ?? '',
        clipboardWriteCount: clipboardWrites.length,
        lastClipboardWrite: clipboardWrites[clipboardWrites.length - 1] ?? '',
      };
    });
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-copy-invite' });
    await harness.relayMock?.writeArtifacts?.();
    const previewShape = inviteShape(invite.preview);
    const roomLinkShape = inviteShape(invite.roomLink);
    const clipboardShape = inviteShape(invite.lastClipboardWrite);
    const classification = clipboardProbe.installed
      && previewShape.roomId
      && previewShape.hasToken
      && clipboardShape.roomId === previewShape.roomId
      && clipboardShape.hasToken
      && /Copied/.test(invite.copyButtonText)
      ? 'converged'
      : 'copy-inconclusive';
    const result = {
      classification,
      clipboardProbe,
      previewShape,
      roomLinkShape,
      clipboardShape,
      clipboardWriteCount: invite.clipboardWriteCount,
      copyButtonText: invite.copyButtonText,
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

async function remoteOutsideReadActivity(ctx) {
  return withHarness({ ...ctx, backend: 'mocked-relay' }, async ({ harness, artifacts, witness }) => {
    await bootFixture(harness, ctx.fixture);
    await clickButtonByText(harness.page, 'Try a free slot');
    await waitForPaneText(harness.page, 'A seat is');
    const beforeRead = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-before-remote-read' });
    if (beforeRead.pane.ui?.outsideRemoteVisible) {
      const result = {
        classification: 'presence-too-eager',
        outsideRemoteVisibleBeforeRead: true,
        browserSummary: summarizeBrowserWitness(beforeRead.browser),
      };
      await artifacts.writeJson('02-result/witness.json', result);
      return result;
    }
    const readDispatch = await harness.page.evaluate(async () => {
      const control = globalThis.__cdRelaySocketControl;
      if (!control) return { dispatched: false, reason: 'missing relay socket control' };
      const id = control.dispatchRead();
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { dispatched: true, id, sentCount: control.sent.length };
    });
    await waitForPaneText(harness.page, 'cloud-room');
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '02-outside-read' });
    await harness.relayMock?.writeArtifacts?.();
    const outsideCount = captured.pane.ui?.outsideRemoteVisible ? 1 : 0;
    const classification = readDispatch.dispatched && outsideCount > 0 ? 'converged' : 'activity-inconclusive';
    const result = {
      classification,
      outsideRemoteVisibleBeforeRead: false,
      readDispatch,
      outsideRemoteVisible: captured.pane.ui?.outsideRemoteVisible,
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

async function remoteReleaseRestoresLocal(ctx) {
  return withHarness({ ...ctx, backend: 'mocked-relay' }, async ({ harness, artifacts, witness }) => {
    await clickButtonByText(harness.page, 'Try a free slot');
    await waitForPaneText(harness.page, 'A seat is');
    await harness.page.getByRole('button', { name: /Leave room/i }).click();
    await waitForPaneText(harness.page, 'Try a free slot', 20_000).catch(() => undefined);
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-released' });
    await harness.relayMock?.writeArtifacts?.();
    const state = captured.pane.state;
    const releaseAttempted = (harness.relayMock?.calls ?? []).some((call) => call.releaseRoomId);
    const classification = releaseAttempted
      && captured.pane.ui?.remoteRoomMode === 'local'
      && ['connected', 'reconnecting'].includes(state?.connection)
      ? 'converged'
      : 'release-attempted-not-restored';
    const result = {
      classification,
      remoteRoomMode: captured.pane.ui?.remoteRoomMode,
      connection: state?.connection,
      releaseAttempted,
      relayCalls: sanitizeJson(harness.relayMock?.calls ?? []),
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

async function remoteConnectFailsReleaseAttempted(ctx) {
  return withHarness({ ...ctx, backend: 'mocked-relay', relaySocketMode: 'never-open' }, async ({ harness, artifacts, witness }) => {
    await clickButtonByText(harness.page, 'Try a free slot');
    await waitForPaneText(harness.page, 'Remote room connection failed', 7_000).catch(() => undefined);
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-connect-failed' });
    await harness.relayMock?.writeArtifacts?.();
    const releaseAttempted = (harness.relayMock?.calls ?? []).some((call) => call.releaseRoomId);
    const classification = releaseAttempted && captured.pane.ui?.remoteRoomMode !== 'remote-connected'
      ? 'converged'
      : 'cleanup-inconclusive';
    const result = {
      classification,
      remoteRoomMode: captured.pane.ui?.remoteRoomMode,
      releaseAttempted,
      relayCalls: sanitizeJson(harness.relayMock?.calls ?? []),
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

async function remoteOccupiedAndUnavailable(ctx) {
  const occupiedRooms = new Set(['public-1', 'public-3', 'public-5']);
  const unavailableRooms = new Set(['public-2', 'public-4']);
  return withHarness({ ...ctx, backend: 'mocked-relay', relayOptions: { occupiedRooms, unavailableRooms } }, async ({ harness, artifacts, witness }) => {
    await clickButtonByText(harness.page, 'Try a free slot');
    await waitForPaneText(harness.page, 'All seats taken').catch(() => undefined);
    const captured = await captureBrowserWitness({ page: harness.page, artifacts, witness, phase: '01-unavailable' });
    await harness.relayMock?.writeArtifacts?.();
    const text = captured.pane.text ?? '';
    const leakedInvite = /cdr2\.|Copy agent instructions|Agent link/i.test(text);
    const classification = captured.pane.ui?.remoteRoomMode === 'remote-unavailable'
      || captured.pane.ui?.welcomeName === 'all-slots-full'
      ? (leakedInvite ? 'privacy-leak' : 'converged')
      : 'unavailable-inconclusive';
    const result = {
      classification,
      remoteRoomMode: captured.pane.ui?.remoteRoomMode,
      welcomeName: captured.pane.ui?.welcomeName,
      leakedInvite,
      relayCalls: sanitizeJson(harness.relayMock?.calls ?? []),
      browserSummary: summarizeBrowserWitness(captured.browser),
    };
    await artifacts.writeJson('02-result/witness.json', result);
    return result;
  });
}

export const SCENARIOS = new Map([
  ['pane-loads-harness', paneLoadsHarness],
  ['local-bridge-state', localBridgeState],
  ['remote-claim-waiting', remoteClaimWaiting],
  ['remote-copy-invite', remoteCopyInvite],
  ['remote-outside-read-activity', remoteOutsideReadActivity],
  ['remote-release-restores-local', remoteReleaseRestoresLocal],
  ['remote-connect-fails-release-attempted', remoteConnectFailsReleaseAttempted],
  ['remote-occupied-and-unavailable', remoteOccupiedAndUnavailable],
]);
