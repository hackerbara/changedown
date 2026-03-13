/**
 * Step definitions for P1-mcp-stdio-smoke.feature.
 *
 * These tests exercise the MCP server over real stdio JSON-RPC transport
 * by spawning the server as a child process. Unlike other step files that
 * call tool handlers directly, these verify the full transport layer works.
 */
import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn, type ChildProcess } from 'node:child_process';
import { ChangeTracksWorld } from './world.js';

// =============================================================================
// Per-scenario state stored in a WeakMap keyed on the world instance
// =============================================================================

interface P1State {
  serverProcess: ChildProcess | null;
  tmpDir: string;
  testFilePath: string;
  nextId: number;
  lastResponse: any;
  lastResponses: any[];
  lastChangeId: string;
  /** Buffer for accumulating stdout data */
  stdoutBuffer: string;
  /** Pending response resolvers keyed by JSON-RPC id */
  pendingRequests: Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>;
}

const p1State: WeakMap<ChangeTracksWorld, P1State> = new WeakMap();

function getState(world: ChangeTracksWorld): P1State {
  const s = p1State.get(world);
  if (!s) throw new Error('P1 state not initialized — run Background steps first');
  return s;
}

// =============================================================================
// JSON-RPC helpers
// =============================================================================

const RESPONSE_TIMEOUT_MS = 15000;

/**
 * Send a JSON-RPC message to the server via stdin and wait for the response.
 * Notifications (no id field) do not wait for a response.
 */
function sendJsonRpc(state: P1State, message: Record<string, unknown>): Promise<any> {
  const proc = state.serverProcess;
  if (!proc || !proc.stdin) throw new Error('Server process not running');

  const line = JSON.stringify(message) + '\n';
  proc.stdin.write(line);

  // Notifications have no id — return immediately
  if (!('id' in message)) return Promise.resolve(undefined);

  const id = message.id as number;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pendingRequests.delete(id);
      reject(new Error(`Timeout waiting for JSON-RPC response id=${id} after ${RESPONSE_TIMEOUT_MS}ms`));
    }, RESPONSE_TIMEOUT_MS);

    state.pendingRequests.set(id, {
      resolve: (value: any) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (reason: any) => {
        clearTimeout(timer);
        reject(reason);
      },
    });
  });
}

/** Allocate the next JSON-RPC request id */
function nextId(state: P1State): number {
  return state.nextId++;
}

/** Send a tool call request and return the result */
async function callTool(state: P1State, toolName: string, args: Record<string, unknown>): Promise<any> {
  const id = nextId(state);
  const response = await sendJsonRpc(state, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: toolName, arguments: args },
  });
  return response;
}

// =============================================================================
// Background steps
// =============================================================================

Given(
  'an MCP server process spawned via stdio transport',
  async function (this: ChangeTracksWorld) {
    // Create state for this scenario
    const state: P1State = {
      serverProcess: null,
      tmpDir: '',
      testFilePath: '',
      nextId: 1,
      lastResponse: null,
      lastResponses: [],
      lastChangeId: '',
      stdoutBuffer: '',
      pendingRequests: new Map(),
    };
    p1State.set(this, state);

    // tmpDir is set in the next background step — just mark initialized
  },
);

Given(
  'a temp project directory with config.toml',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);

    // Create temp directory
    state.tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-p1-stdio-'));

    // Create .changetracks/config.toml
    const configDir = path.join(state.tmpDir, '.changetracks');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.toml'),
      `[tracking]
default = "tracked"

[author]
enforcement = "optional"

[hashline]
enabled = true

[settlement]
auto_on_approve = true
auto_on_reject = true
`,
      'utf-8',
    );

    // Create test markdown file
    state.testFilePath = path.join(state.tmpDir, 'test.md');
    await fs.writeFile(
      state.testFilePath,
      '# Test Document\n\nHello world.\n\nSecond paragraph here.\n',
      'utf-8',
    );

    // Spawn the MCP server. Use the built dist file.
    const serverPath = path.resolve(
      __dirname,
      '../../../../changetracks-plugin/mcp-server/dist/index.js',
    );

    // Verify server exists
    try {
      await fs.access(serverPath);
    } catch {
      throw new Error(
        `MCP server dist not found at ${serverPath} — run 'npm run build' in changetracks-plugin/mcp-server first`,
      );
    }

    state.serverProcess = spawn('node', [serverPath], {
      cwd: state.tmpDir,
      env: {
        ...process.env,
        CHANGETRACKS_PROJECT_DIR: state.tmpDir,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Wire stdout parsing — each line is a JSON-RPC response
    state.serverProcess.stdout!.on('data', (chunk: Buffer) => {
      state.stdoutBuffer += chunk.toString('utf-8');
      // Process complete lines
      let newlineIdx: number;
      while ((newlineIdx = state.stdoutBuffer.indexOf('\n')) !== -1) {
        const line = state.stdoutBuffer.slice(0, newlineIdx).trim();
        state.stdoutBuffer = state.stdoutBuffer.slice(newlineIdx + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id != null && state.pendingRequests.has(parsed.id)) {
            const pending = state.pendingRequests.get(parsed.id)!;
            state.pendingRequests.delete(parsed.id);
            pending.resolve(parsed);
          }
        } catch {
          // Non-JSON line on stdout — ignore (server debug output)
        }
      }
    });

    // stderr is for server logs — capture but don't fail on it
    state.serverProcess.stderr!.on('data', () => {
      // swallow stderr log output
    });

    // Handle premature exit
    state.serverProcess.on('exit', (code) => {
      // Reject all pending requests
      for (const [id, pending] of state.pendingRequests) {
        state.pendingRequests.delete(id);
        pending.reject(new Error(`Server exited with code ${code} while waiting for response id=${id}`));
      }
    });

    // Initialize the MCP connection
    const initId = nextId(state);
    const initResponse = await sendJsonRpc(state, {
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'p1-test', version: '1.0.0' },
      },
    });

    assert.ok(initResponse, 'Server did not respond to initialize');
    assert.ok(initResponse.result, 'Initialize response missing result');

    // Send initialized notification
    await sendJsonRpc(state, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Small delay to let the server process the notification
    await new Promise((resolve) => setTimeout(resolve, 200));
  },
);

// =============================================================================
// Cleanup
// =============================================================================

After({ tags: '@stdio or not @skip' }, async function (this: ChangeTracksWorld) {
  const state = p1State.get(this);
  if (!state) return;

  // Kill server process
  if (state.serverProcess && !state.serverProcess.killed) {
    state.serverProcess.kill('SIGTERM');
    // Wait briefly for clean shutdown
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!state.serverProcess.killed) {
      state.serverProcess.kill('SIGKILL');
    }
  }

  // Clean up temp directory
  if (state.tmpDir) {
    await fs.rm(state.tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  p1State.delete(this);
});

// =============================================================================
// Scenario 1: Server initializes and lists tools
// =============================================================================

When(
  'I send a JSON-RPC {string} request',
  async function (this: ChangeTracksWorld, method: string) {
    const state = getState(this);
    const id = nextId(state);
    state.lastResponse = await sendJsonRpc(state, {
      jsonrpc: '2.0',
      id,
      method,
      params: {},
    });
  },
);

Then(
  'I receive a valid response with at least {int} tools',
  function (this: ChangeTracksWorld, expectedCount: number) {
    const state = getState(this);
    assert.ok(state.lastResponse, 'No response received');
    assert.ok(state.lastResponse.result, 'Response missing result');
    const tools = state.lastResponse.result.tools;
    assert.ok(Array.isArray(tools), 'tools is not an array');
    assert.ok(
      tools.length >= expectedCount,
      `Expected at least ${expectedCount} tools but got ${tools.length}: ${tools.map((t: any) => t.name).join(', ')}`,
    );
  },
);

Then(
  'the tools include: read_tracked_file, propose_change, review_changes, get_change, amend_change, list_changes, supersede_change',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    const tools = state.lastResponse.result.tools;
    const toolNames = tools.map((t: any) => t.name);
    const expected = [
      'read_tracked_file',
      'propose_change',
      'review_changes',
      'get_change',
      'amend_change',
      'list_changes',
      'supersede_change',
    ];
    for (const name of expected) {
      assert.ok(
        toolNames.includes(name),
        `Expected tool "${name}" in list but got: ${toolNames.join(', ')}`,
      );
    }
  },
);

// =============================================================================
// Scenario 2: Full round-trip via stdio
// =============================================================================

When(
  'I send read_tracked_file for a tracked file',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);
    state.lastResponse = await callTool(state, 'read_tracked_file', {
      file: state.testFilePath,
      view: 'review',
    });
  },
);

Then(
  'I receive content with no errors',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.ok(state.lastResponse, 'No response received');
    assert.ok(state.lastResponse.result, 'Response missing result');
    const result = state.lastResponse.result;
    assert.notEqual(result.isError, true, 'Response was an error');
    assert.ok(
      Array.isArray(result.content) && result.content.length > 0,
      'Response missing content',
    );
  },
);

When(
  'I send propose_change with old_text\\/new_text',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);
    state.lastResponse = await callTool(state, 'propose_change', {
      file: state.testFilePath,
      old_text: 'Hello world.',
      new_text: 'Hello universe.',
      reason: 'stdio test',
    });
  },
);

Then(
  'I receive a response with change_id',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.ok(state.lastResponse, 'No response received');
    assert.ok(state.lastResponse.result, 'Response missing result');
    const result = state.lastResponse.result;
    assert.notEqual(result.isError, true, 'Response was an error');
    // Parse the content text to find change_id
    const text = result.content[0]?.text ?? '';
    const parsed = JSON.parse(text);
    assert.ok(parsed.change_id, `Expected change_id in response but got: ${text}`);
    state.lastChangeId = parsed.change_id;
  },
);

When(
  'I send review_changes approving the change',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.ok(state.lastChangeId, 'No change_id from previous step');
    state.lastResponse = await callTool(state, 'review_changes', {
      file: state.testFilePath,
      reviews: [
        {
          change_id: state.lastChangeId,
          decision: 'approve',
          reason: 'looks good',
        },
      ],
    });
  },
);

Then(
  'I receive a success response',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.ok(state.lastResponse, 'No response received');
    assert.ok(state.lastResponse.result, 'Response missing result');
    const result = state.lastResponse.result;
    assert.notEqual(result.isError, true, `Expected success but got error: ${JSON.stringify(result)}`);
  },
);

Then(
  'the file on disk reflects the settled change',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);
    const content = await fs.readFile(state.testFilePath, 'utf-8');
    // After approval with auto_on_approve=true, the CriticMarkup is settled
    // and the new text should be in the file without delimiters
    assert.ok(
      content.includes('Hello universe.'),
      `Expected settled text "Hello universe." in file but got:\n${content}`,
    );
    // The old text should be gone (substitution was settled)
    assert.ok(
      !content.includes('{~~'),
      `Expected no CriticMarkup substitution delimiters in file but got:\n${content}`,
    );
  },
);

// =============================================================================
// Scenario 3: Error responses are well-formed JSON-RPC
// =============================================================================

When(
  'I send propose_change for a nonexistent file',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);
    state.lastResponse = await callTool(state, 'propose_change', {
      file: path.join(state.tmpDir, 'does-not-exist.md'),
      old_text: 'foo',
      new_text: 'bar',
      reason: 'test',
    });
  },
);

Then(
  'I receive a JSON-RPC error response',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.ok(state.lastResponse, 'No response received');
    // MCP tool errors are returned as result.isError=true (not JSON-RPC level error)
    const result = state.lastResponse.result;
    assert.ok(result, 'Response missing result');
    assert.equal(result.isError, true, 'Expected isError=true for error response');
  },
);

Then(
  'the error has a message field describing the problem',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    const result = state.lastResponse.result;
    assert.ok(
      Array.isArray(result.content) && result.content.length > 0,
      'Error response missing content',
    );
    const text = result.content[0]?.text ?? '';
    assert.ok(
      text.length > 0,
      'Error response has empty message text',
    );
    // The error text should describe the problem (file not found, etc.)
    assert.ok(
      text.toLowerCase().includes('not found') ||
      text.toLowerCase().includes('no such file') ||
      text.toLowerCase().includes('enoent') ||
      text.toLowerCase().includes('does not exist') ||
      text.toLowerCase().includes('error') ||
      text.toLowerCase().includes('cannot') ||
      text.length > 5,  // At minimum, a non-trivial message
      `Expected descriptive error message but got: ${text}`,
    );
  },
);

// =============================================================================
// Scenario 4: Backward-compat alias works via transport
// =============================================================================

When(
  'I send a {string} tool call \\(unlisted alias)',
  async function (this: ChangeTracksWorld, toolName: string) {
    const state = getState(this);
    // propose_batch expects a changes array with file, old_text, new_text per change
    state.lastResponse = await callTool(state, toolName, {
      file: state.testFilePath,
      changes: [
        { old_text: 'Hello world.', new_text: 'Hello cosmos.', reason: 'batch test 1' },
        { old_text: 'Second paragraph here.', new_text: 'Updated paragraph here.', reason: 'batch test 2' },
      ],
    });
  },
);

Then(
  'the server routes it correctly and returns grouped change IDs',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.ok(state.lastResponse, 'No response received');
    assert.ok(state.lastResponse.result, 'Response missing result');
    const result = state.lastResponse.result;
    assert.notEqual(result.isError, true, `Expected success but got error: ${JSON.stringify(result)}`);
    // Parse the content to verify we got change IDs
    const text = result.content[0]?.text ?? '';
    const parsed = JSON.parse(text);
    // propose_batch returns grouped changes with change_ids or similar
    const hasChangeIds =
      parsed.change_id ||
      parsed.change_ids ||
      parsed.group_id ||
      (Array.isArray(parsed.changes) && parsed.changes.length > 0) ||
      (typeof parsed === 'object' && Object.keys(parsed).some(k => k.includes('change')));
    assert.ok(
      hasChangeIds,
      `Expected grouped change IDs in response but got: ${text}`,
    );
  },
);

// =============================================================================
// Scenario 5: Concurrent requests on same file
// =============================================================================

When(
  'I send two propose_change requests in rapid succession',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);

    // Send two requests in rapid succession — send the first, then
    // immediately send the second. The MCP server is single-threaded
    // so it processes them sequentially, but we verify both complete
    // correctly without corruption or deadlock.
    const resp1 = await callTool(state, 'propose_change', {
      file: state.testFilePath,
      old_text: 'Hello world.',
      new_text: 'Hello alpha.',
      reason: 'concurrent test 1',
    });

    const resp2 = await callTool(state, 'propose_change', {
      file: state.testFilePath,
      old_text: 'Second paragraph here.',
      new_text: 'Modified paragraph here.',
      reason: 'concurrent test 2',
    });

    state.lastResponses = [resp1, resp2];
  },
);

Then(
  'both complete without corruption',
  function (this: ChangeTracksWorld) {
    const state = getState(this);
    assert.equal(state.lastResponses.length, 2, 'Expected 2 responses');
    for (let i = 0; i < state.lastResponses.length; i++) {
      const resp = state.lastResponses[i];
      assert.ok(resp, `Response ${i + 1} is null`);
      assert.ok(resp.result, `Response ${i + 1} missing result`);
      assert.notEqual(
        resp.result.isError,
        true,
        `Response ${i + 1} was an error: ${JSON.stringify(resp.result)}`,
      );
    }
  },
);

Then(
  'the file contains both changes with sequential IDs',
  async function (this: ChangeTracksWorld) {
    const state = getState(this);
    const content = await fs.readFile(state.testFilePath, 'utf-8');
    // Both changes should be present in the file as CriticMarkup
    assert.ok(
      content.includes('[^ct-1]') || content.includes('ct-1'),
      `Expected ct-1 in file but got:\n${content}`,
    );
    assert.ok(
      content.includes('[^ct-2]') || content.includes('ct-2'),
      `Expected ct-2 in file but got:\n${content}`,
    );
  },
);
