import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ARTIFACT_ROOT = 'docs/findings/word-pane-browser-harness';
const PRIVACY_PATTERN = /cdr2\.|Bearer [A-Za-z0-9._~+/-]+|token=[A-Za-z0-9._~+/-]+|\/Users\/MAC/;

function scenarioFromDirName(name) {
  return String(name).replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '');
}

function classificationFromSummary(summary) {
  return summary.match(/Classification: `([^`]+)`/)?.[1] ?? 'unknown';
}

async function walkFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export async function latestScenarioRows({ artifactRoot = DEFAULT_ARTIFACT_ROOT } = {}) {
  const entries = await fs.readdir(artifactRoot, { withFileTypes: true }).catch(() => []);
  const latest = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const scenario = scenarioFromDirName(entry.name);
    const dir = path.join(artifactRoot, entry.name);
    const existing = latest.get(scenario);
    if (!existing || entry.name > existing.name) latest.set(scenario, { name: entry.name, dir });
  }
  const rows = [];
  for (const [scenario, { dir }] of [...latest.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const summary = await fs.readFile(path.join(dir, 'summary.md'), 'utf8').catch(() => '');
    rows.push({ scenario, classification: classificationFromSummary(summary), artifactPath: dir });
  }
  return rows;
}

export async function scanArtifactPrivacy({ artifactRoot = DEFAULT_ARTIFACT_ROOT } = {}) {
  const matches = [];
  for (const file of await walkFiles(artifactRoot)) {
    if (/\.(png|jpg|jpeg|webp)$/i.test(file)) continue;
    const text = await fs.readFile(file, 'utf8').catch(() => '');
    if (PRIVACY_PATTERN.test(text)) matches.push(file);
  }
  return { ok: matches.length === 0, matches };
}

export function renderLatestReport({ rows, privacy }) {
  const lines = [
    '# Word Pane Browser Goblin Lab Latest Report',
    '',
    '| Scenario | Classification | Artifact path |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.scenario} | ${row.classification} | \`${row.artifactPath}\` |`),
    '',
    `Privacy scan: ${privacy.ok ? 'passed' : 'failed'}`,
  ];
  if (!privacy.ok) {
    lines.push('', 'Matched files:', ...privacy.matches.map((file) => `- \`${file}\``));
  }
  return `${lines.join('\n')}\n`;
}

export async function latestReport(options) {
  const rows = await latestScenarioRows(options);
  const privacy = await scanArtifactPrivacy(options);
  return { rows, privacy, text: renderLatestReport({ rows, privacy }) };
}
