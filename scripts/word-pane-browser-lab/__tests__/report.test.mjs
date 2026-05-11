import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { latestReport, latestScenarioRows, scanArtifactPrivacy } from '../report.mjs';

async function writeSummary(root, dir, classification) {
  const out = path.join(root, dir);
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'summary.md'), `# Summary\n\nClassification: \`${classification}\`\n`, 'utf8');
  return out;
}

test('latestScenarioRows chooses latest artifact per scenario', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'word-pane-report-'));
  await writeSummary(root, '2026-05-09T00-00-00-000Z-remote-copy-invite', 'old');
  const latest = await writeSummary(root, '2026-05-09T01-00-00-000Z-remote-copy-invite', 'converged');

  assert.deepEqual(await latestScenarioRows({ artifactRoot: root }), [
    { scenario: 'remote-copy-invite', classification: 'converged', artifactPath: latest },
  ]);
});

test('scanArtifactPrivacy reports textual token leaks but ignores screenshots', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'word-pane-report-'));
  const dir = await writeSummary(root, '2026-05-09T00-00-00-000Z-remote-copy-invite', 'converged');
  await fs.writeFile(path.join(dir, 'leak.json'), '{"token":"cdr2.public-1.secret"}', 'utf8');
  await fs.writeFile(path.join(dir, 'screenshot.png'), 'cdr2.public-1.visual', 'utf8');

  const privacy = await scanArtifactPrivacy({ artifactRoot: root });
  assert.equal(privacy.ok, false);
  assert.equal(privacy.matches.length, 1);
  assert.match(privacy.matches[0], /leak\.json$/);
});

test('latestReport renders a markdown table and privacy status', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'word-pane-report-'));
  await writeSummary(root, '2026-05-09T00-00-00-000Z-pane-loads-harness', 'loaded-reconnecting');

  const report = await latestReport({ artifactRoot: root });
  assert.match(report.text, /pane-loads-harness/);
  assert.match(report.text, /loaded-reconnecting/);
  assert.match(report.text, /Privacy scan: passed/);
});
