import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBrowserLabArtifacts } from '../artifacts.mjs';

test('createBrowserLabArtifacts writes JSON, text, transcript, and summary', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cd-browser-lab-artifacts-'));
  const artifacts = await createBrowserLabArtifacts({ baseDir, mode: 'run', scenario: 'pane-loads-harness', runId: 'run-1' });
  await artifacts.writeJson('phase/state.json', { ok: true });
  await artifacts.writeText('phase/dom.txt', 'safe dom summary');
  await artifacts.appendTranscript({ event: 'hello' });
  await artifacts.writeSummary({ classification: 'converged', details: { pageUrl: 'https://localhost:3001/harness.html?harness=1' } });

  assert.equal(artifacts.dir, path.join(baseDir, 'run-1-pane-loads-harness'));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(artifacts.dir, 'phase/state.json'), 'utf8')), { ok: true });
  assert.equal(await fs.readFile(path.join(artifacts.dir, 'phase/dom.txt'), 'utf8'), 'safe dom summary');
  assert.match(await fs.readFile(path.join(artifacts.dir, 'transcript.jsonl'), 'utf8'), /"event":"hello"/);
  assert.match(await fs.readFile(path.join(artifacts.dir, 'summary.md'), 'utf8'), /Classification: `converged`/);
});

test('artifact writer rejects path traversal', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cd-browser-lab-artifacts-'));
  const artifacts = await createBrowserLabArtifacts({ baseDir, mode: 'run', scenario: 'x', runId: 'run-2' });
  await assert.rejects(() => artifacts.writeText('../escape.txt', 'bad'), /outside artifact directory/);
});


test('artifact pathFor returns guarded paths for binary writers', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cd-browser-lab-artifacts-'));
  const artifacts = await createBrowserLabArtifacts({ baseDir, mode: 'run', scenario: 'x', runId: 'run-3' });
  assert.equal(artifacts.pathFor('phase/screenshot.png'), path.join(artifacts.dir, 'phase/screenshot.png'));
  assert.throws(() => artifacts.pathFor('../escape.png'), /outside artifact directory/);
});
