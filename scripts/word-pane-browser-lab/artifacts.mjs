import fs from 'node:fs/promises';
import path from 'node:path';
import { sanitizeJson } from './redact.mjs';

function safePart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

function defaultRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function createBrowserLabArtifacts({
  mode,
  scenario,
  baseDir = 'docs/findings/word-pane-browser-harness',
  runId = defaultRunId(),
}) {
  const dir = path.resolve(baseDir, `${safePart(runId)}-${safePart(scenario)}`);
  await fs.mkdir(dir, { recursive: true });

  function artifactPath(relativePath) {
    const out = path.resolve(dir, relativePath);
    const relative = path.relative(dir, out);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Artifact path is outside artifact directory: ${relativePath}`);
    }
    return out;
  }

  async function writeJson(relativePath, value) {
    const out = artifactPath(relativePath);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, `${JSON.stringify(sanitizeJson(value), null, 2)}\n`, 'utf8');
  }

  async function writeText(relativePath, text) {
    const out = artifactPath(relativePath);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, String(text), 'utf8');
  }

  async function appendTranscript(value) {
    const line = JSON.stringify(sanitizeJson({ ts: new Date().toISOString(), mode, scenario, ...value }));
    await fs.appendFile(artifactPath('transcript.jsonl'), `${line}\n`, 'utf8');
  }

  async function writeSummary({ classification, details }) {
    const sanitizedDetails = sanitizeJson(details ?? {});
    const body = [
      `# Word Pane Browser Lab: ${scenario}`,
      '',
      `Classification: \`${classification}\``,
      '',
      `Mode: \`${mode}\``,
      '',
      '## Details',
      '',
      '```json',
      JSON.stringify(sanitizedDetails, null, 2),
      '```',
      '',
    ].join('\n');
    await writeText('summary.md', body);
  }

  return { dir, pathFor: artifactPath, writeJson, writeText, appendTranscript, writeSummary };
}
