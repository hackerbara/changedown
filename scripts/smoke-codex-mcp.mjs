#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repo, 'changedown-plugin', 'codex.mcp.shipped.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

assertPublicConfigShape(config);
await runConfiguredRootSmoke();
await runNoEnvAbsolutePathSmoke();

function assertPublicConfigShape(config) {
  const server = config.mcpServers?.cd;
  if (!server) throw new Error('Missing mcpServers.cd');
  if ('cwd' in server) throw new Error('Public Codex MCP config must not contain cwd');
  if (server.command !== 'npx') throw new Error(`Expected public command npx, got ${server.command}`);
  if (!server.args?.includes('-y')) throw new Error('Public Codex MCP config must include npx -y');
  if (!server.args?.some((arg) => /^@changedown\/mcp@\d+\.\d+\.\d+$/.test(arg))) {
    throw new Error('Public Codex MCP config must pin @changedown/mcp@x.y.z');
  }
}

async function runConfiguredRootSmoke() {
  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-codex-configured-project-'));
  try {
    writeSmokeProject(smokeRoot);
    const smokeFile = path.join(smokeRoot, 'doc.md');
    fs.writeFileSync(smokeFile, 'Codex absolute smoke\n', 'utf8');

    const localServerPath = localServerEntrypoint();
    await runProtocolSmoke({
      label: 'configured-root',
      child: spawn('node', [localServerPath], {
        cwd: repo,
        env: {
          ...process.env,
          CHANGEDOWN_PROJECT_DIR: smokeRoot,
          CHANGEDOWN_MCP_PORT: randomPort(),
          CHANGEDOWN_MCP_USE_HTTP: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
      readFile: smokeFile,
    });
  } finally {
    fs.rmSync(smokeRoot, { recursive: true, force: true });
  }
}

async function runNoEnvAbsolutePathSmoke() {
  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-codex-smoke-project-'));
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-codex-smoke-cache-'));

  try {
    writeSmokeProject(smokeRoot);
    const smokeFile = path.join(smokeRoot, 'doc.md');
    fs.writeFileSync(smokeFile, 'Codex absolute smoke\n', 'utf8');

    const env = {
      ...process.env,
      PWD: unrelated,
      CHANGEDOWN_MCP_PORT: randomPort(),
      CHANGEDOWN_MCP_USE_HTTP: '1',
    };
    delete env.CHANGEDOWN_PROJECT_DIR;
    delete env.CODEX_WORKSPACE_ROOT;

    await runProtocolSmoke({
      label: 'no-env absolute-path',
      child: spawn('node', [localServerEntrypoint()], { cwd: unrelated, env, stdio: ['pipe', 'pipe', 'pipe'] }),
      readFile: smokeFile,
    });
  } finally {
    fs.rmSync(smokeRoot, { recursive: true, force: true });
    fs.rmSync(unrelated, { recursive: true, force: true });
  }
}

function writeSmokeProject(root) {
  fs.mkdirSync(path.join(root, '.changedown'), { recursive: true });
  fs.writeFileSync(path.join(root, '.changedown', 'config.toml'), [
    '[tracking]',
    'include = ["**/*.md"]',
    'exclude = []',
    'default = "tracked"',
    'auto_header = false',
    '',
    '[author]',
    'default = "test"',
    'enforcement = "optional"',
    '',
    '[hooks]',
    'enforcement = "warn"',
    'exclude = []',
    '',
    '[matching]',
    'mode = "normalized"',
    '',
    '[hashline]',
    'enabled = false',
    '',
    '[settlement]',
    'auto_on_approve = true',
    'auto_on_reject = true',
    '',
    '[protocol]',
    'mode = "classic"',
    'level = 2',
    'reasoning = "optional"',
    'batch_reasoning = "optional"',
    '',
  ].join('\n'), 'utf8');
}

function localServerEntrypoint() {
  const localServerPath = path.join(repo, 'packages', 'mcp', 'dist', 'index.js');
  if (!fs.existsSync(localServerPath)) {
    throw new Error(`Missing local MCP server build: ${localServerPath}. Run npm run build:plugin first.`);
  }
  return localServerPath;
}

function randomPort() {
  return String(41000 + Math.floor(Math.random() * 10000));
}

async function runProtocolSmoke({ label, child, readFile }) {
  let stdout = '';
  let stderr = '';
  let nextId = 1;
  const pending = new Map();
  let buffer = '';
  let childClosed = false;

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    stdout += text;
    buffer += text;
    while (true) {
      const idx = buffer.indexOf('\n');
      if (idx === -1) break;
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        const err = new Error(`Invalid JSON from MCP stdout: ${line}`);
        for (const [, slot] of pending) slot.reject(err);
        pending.clear();
        try { child.kill('SIGTERM'); } catch {}
        return;
      }
      if (Object.prototype.hasOwnProperty.call(msg, 'id')) {
        const slot = pending.get(msg.id);
        if (slot) {
          pending.delete(msg.id);
          clearTimeout(slot.timeout);
          slot.resolve(msg);
        }
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  child.on('close', () => {
    childClosed = true;
  });

  child.on('exit', (code, signal) => {
    for (const [, slot] of pending) {
      clearTimeout(slot.timeout);
      slot.reject(new Error(`MCP exited before response: code=${code} signal=${signal}\nstderr=${stderr}`));
    }
    pending.clear();
  });

  function waitForChildClose(timeoutMs) {
    if (childClosed) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => finish(false), timeoutMs);
      timeout.unref();
      function finish(closed) {
        clearTimeout(timeout);
        child.off('close', onClose);
        resolve(closed);
      }
      function onClose() {
        finish(true);
      }
      child.once('close', onClose);
    });
  }

  async function cleanupChild() {
    if (childClosed) return;
    try { child.kill('SIGTERM'); } catch {}
    if (await waitForChildClose(1500)) return;
    try { child.kill('SIGKILL'); } catch {}
    await waitForChildClose(500);
  }

  async function fail(message) {
    await cleanupChild();
    const details = [message];
    if (stderr) details.push(`--- stderr ---\n${stderr}`);
    if (stdout) details.push(`--- stdout ---\n${stdout}`);
    throw new Error(details.join('\n'));
  }

  function send(method, params) {
    const id = nextId++;
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 5000);
      timeout.unref();
      pending.set(id, { resolve, reject, timeout });
    });
  }

  function notify(method, params = {}) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  try {
    const init = await send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'changedown-codex-smoke', version: '0.0.0' },
    });
    if (init.error) await fail(`initialize failed: ${JSON.stringify(init.error)}`);

    notify('notifications/initialized');

    const tools = await send('tools/list', {});
    if (tools.error) await fail(`tools/list failed: ${JSON.stringify(tools.error)}`);

    const names = tools.result?.tools?.map((tool) => tool.name) ?? [];
    const expected = [
      'read_tracked_file',
      'propose_change',
      'review_changes',
      'amend_change',
      'list_changes',
      'supersede_change',
      'resolve_thread',
    ];
    const missing = expected.filter((name) => !names.includes(name));
    if (missing.length) await fail(`Missing tools: ${missing.join(', ')}`);

    const read = await send('tools/call', {
      name: 'read_tracked_file',
      arguments: { file: readFile, view: 'raw' },
    });
    if (read.error) await fail(`read_tracked_file failed: ${JSON.stringify(read.error)}`);
    if (read.result?.isError) await fail(`read_tracked_file returned tool error: ${JSON.stringify(read.result?.content ?? [])}`);
    const text = (read.result?.content ?? [])
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n');
    if (!text.includes('Codex absolute smoke')) {
      await fail(`read_tracked_file did not return smoke content; got: ${text.slice(0, 200)}`);
    }

    await cleanupChild();
    console.log(`Codex MCP smoke passed [${label}] (${names.length} tools)`);
  } catch (err) {
    await cleanupChild();
    throw err;
  }
}
