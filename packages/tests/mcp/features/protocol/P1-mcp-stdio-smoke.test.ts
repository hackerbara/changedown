/**
 * P1: MCP stdio transport smoke tests
 *
 * Spawns the actual MCP server as a child process, communicates over
 * stdio using the official @modelcontextprotocol/sdk Client +
 * StdioClientTransport, and verifies end-to-end JSON-RPC round-trips.
 *
 * PREREQUISITE: The MCP server must be compiled before running these tests.
 *   cd changetracks-plugin/mcp-server && npm run build
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

// Resolve the compiled server entry point.
// The MCP server dist is at changetracks-plugin/mcp-server/dist/index.js
// This test file is at packages/tests/mcp/features/protocol/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.resolve(__dirname, '../../../../../changetracks-plugin/mcp-server/dist/index.js');

/** Timeout for individual MCP operations (server startup is slow) */
const OP_TIMEOUT = 15_000;

/** The 6 listed tool names in the current tool surface */
const LISTED_TOOLS = [
  'read_tracked_file',
  'propose_change',
  'review_changes',
  'amend_change',
  'list_changes',
  'supersede_change',
];

/**
 * Minimal TOML config for a tracked project. Matches the BDD
 * ScenarioContext defaults but written as raw TOML for the spawned process.
 */
function minimalConfigToml(): string {
  return `
[tracking]
include = ["**/*.md"]
exclude = []
default = "tracked"
auto_header = false

[author]
default = "ai:test-agent"
enforcement = "optional"

[hooks]
enforcement = "warn"
exclude = []

[matching]
mode = "normalized"

[hashline]
enabled = false

[settlement]
auto_on_approve = true
auto_on_reject = true

[policy]
mode = "safety-net"
creation_tracking = "footnote"

[protocol]
mode = "classic"
level = 2
`.trim();
}

/**
 * Helper: create a temp project directory with .changetracks/config.toml
 * and optionally seed files.
 */
async function createTmpProject(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ct-p1-'));
  const configDir = path.join(tmpDir, '.changetracks');
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(path.join(configDir, 'config.toml'), minimalConfigToml(), 'utf-8');
  return tmpDir;
}

/**
 * Helper: create a file inside a project directory.
 */
async function seedFile(projectDir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(projectDir, name);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Helper: spawn an MCP client connected to the changetracks server via stdio.
 */
async function createMcpClient(projectDir: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [SERVER_ENTRY],
    env: {
      ...process.env as Record<string, string>,
      CHANGETRACKS_PROJECT_DIR: projectDir,
    },
    stderr: 'pipe',
  });

  const client = new Client(
    { name: 'p1-smoke-test', version: '0.0.1' },
    { capabilities: {} },
  );

  await client.connect(transport);
  return client;
}

/**
 * Extract text from a callTool result. The MCP SDK returns a union type;
 * we handle the standard CallToolResult shape with content[].
 */
function extractText(result: unknown): string {
  const r = result as { content?: Array<{ type: string; text: string }> };
  if (!r.content?.length) return '';
  return r.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

function isError(result: unknown): boolean {
  const r = result as { isError?: boolean };
  return r.isError === true;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('P1: MCP stdio transport smoke tests', () => {
  let tmpDir: string;
  let client: Client;

  beforeAll(async () => {
    // Verify the compiled server exists
    try {
      await fs.access(SERVER_ENTRY);
    } catch {
      throw new Error(
        `Compiled server not found at ${SERVER_ENTRY}. Run: cd changetracks-plugin/mcp-server && npm run build`,
      );
    }
  }, 10_000);

  afterEach(async () => {
    // Close client after each test to prevent process leaks
    try {
      await client?.close();
    } catch {
      // Best-effort cleanup
    }
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Server initializes and lists tools
  // -------------------------------------------------------------------------
  it('Scenario: Server initializes and lists tools', async () => {
    tmpDir = await createTmpProject();
    client = await createMcpClient(tmpDir);

    const result = await client.listTools();

    // Verify we get exactly 6 tools
    expect(result.tools).toHaveLength(6);

    // Verify exact tool names
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual([...LISTED_TOOLS].sort());

    // Each tool has a description and inputSchema
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  }, OP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Scenario 2: Full round-trip via stdio -- read -> propose -> review
  // -------------------------------------------------------------------------
  it('Scenario: Full round-trip via stdio -- read, propose, review', async () => {
    tmpDir = await createTmpProject();

    // Seed a markdown file
    const filePath = await seedFile(tmpDir, 'doc.md', [
      '# Test Doc',
      '',
      'The API uses REST for all endpoints.',
    ].join('\n'));

    client = await createMcpClient(tmpDir);

    // Step 1: Read the tracked file
    const readResult = await client.callTool({
      name: 'read_tracked_file',
      arguments: { file: filePath, view: 'content' },
    });
    expect(isError(readResult)).toBe(false);
    const readText = extractText(readResult);
    expect(readText).toContain('REST');

    // Step 2: Propose a substitution
    const proposeResult = await client.callTool({
      name: 'propose_change',
      arguments: {
        file: filePath,
        old_text: 'REST',
        new_text: 'GraphQL',
        reason: 'Protocol test',
      },
    });
    expect(isError(proposeResult)).toBe(false);
    const proposeText = extractText(proposeResult);
    const proposeData = JSON.parse(proposeText);
    expect(proposeData.change_id).toBe('ct-1');
    expect(proposeData.type).toBe('sub');

    // Verify on disk
    const diskAfterPropose = await fs.readFile(filePath, 'utf-8');
    expect(diskAfterPropose).toContain('{~~REST~>GraphQL~~}');
    expect(diskAfterPropose).toContain('[^ct-1]');

    // Step 3: Approve the change (auto_on_approve = true triggers settlement)
    const reviewResult = await client.callTool({
      name: 'review_changes',
      arguments: {
        file: filePath,
        reviews: [
          { change_id: 'ct-1', decision: 'approve', reason: 'Looks good' },
        ],
      },
    });
    expect(isError(reviewResult)).toBe(false);

    // Step 4: Verify file on disk reflects settled change
    const diskAfterReview = await fs.readFile(filePath, 'utf-8');
    // After settlement: CriticMarkup inline delimiters removed, text replaced
    expect(diskAfterReview).toContain('GraphQL');
    expect(diskAfterReview).not.toContain('{~~');
    expect(diskAfterReview).not.toContain('~~}');
    // Footnote persists (Layer 1)
    expect(diskAfterReview).toContain('[^ct-1]');
    expect(diskAfterReview).toContain('accepted');
  }, OP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Scenario 3: Error responses are well-formed
  // -------------------------------------------------------------------------
  it('Scenario: Error responses are well-formed JSON-RPC', async () => {
    tmpDir = await createTmpProject();
    client = await createMcpClient(tmpDir);

    // Call propose_change for a nonexistent file
    const result = await client.callTool({
      name: 'propose_change',
      arguments: {
        file: path.join(tmpDir, 'does-not-exist.md'),
        old_text: 'foo',
        new_text: 'bar',
        reason: 'test',
      },
    });

    // The MCP server returns tool-level errors as isError: true
    // (not JSON-RPC protocol errors, which would throw)
    expect(isError(result)).toBe(true);
    const errorText = extractText(result);
    expect(errorText.length).toBeGreaterThan(0);
    // Error describes the problem (file not found / not tracked)
    expect(errorText.toLowerCase()).toMatch(/not found|does not exist|no such|enoent|not tracked|outside/i);
  }, OP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Scenario 4: Backward-compat alias works via transport
  // -------------------------------------------------------------------------
  it('Scenario: Backward-compat alias (propose_batch) works via transport', async () => {
    tmpDir = await createTmpProject();

    const filePath = await seedFile(tmpDir, 'batch.md', [
      '# Batch Test',
      '',
      'Line A is here.',
      'Line B is here.',
    ].join('\n'));

    client = await createMcpClient(tmpDir);

    // propose_batch is an unlisted alias that still works
    const result = await client.callTool({
      name: 'propose_batch',
      arguments: {
        file: filePath,
        changes: [
          { old_text: 'Line A', new_text: 'Line Alpha', reason: 'rename A' },
          { old_text: 'Line B', new_text: 'Line Beta', reason: 'rename B' },
        ],
        reason: 'Batch rename test',
      },
    });

    expect(isError(result)).toBe(false);
    const text = extractText(result);
    // propose_batch returns grouped change IDs
    expect(text).toContain('ct-1');

    // Verify on disk — both changes applied
    const disk = await fs.readFile(filePath, 'utf-8');
    expect(disk).toContain('Alpha');
    expect(disk).toContain('Beta');
  }, OP_TIMEOUT);

  // -------------------------------------------------------------------------
  // Scenario 5: Concurrent requests on same file
  // -------------------------------------------------------------------------
  it('Scenario: Concurrent requests on same file', async () => {
    tmpDir = await createTmpProject();

    const filePath = await seedFile(tmpDir, 'concurrent.md', [
      '# Concurrent Test',
      '',
      'First line of content.',
      'Second line of content.',
    ].join('\n'));

    client = await createMcpClient(tmpDir);

    // Send two proposals concurrently (rapid succession)
    const [r1, r2] = await Promise.all([
      client.callTool({
        name: 'propose_change',
        arguments: {
          file: filePath,
          old_text: 'First line of content.',
          new_text: 'Updated first line.',
          reason: 'Change 1',
        },
      }),
      client.callTool({
        name: 'propose_change',
        arguments: {
          file: filePath,
          old_text: 'Second line of content.',
          new_text: 'Updated second line.',
          reason: 'Change 2',
        },
      }),
    ]);

    // At least one should succeed without corruption.
    // Concurrent file mutations are serialized by the handler's file I/O,
    // so one will find its text and the other will see the modified file.
    // Both completing without an exception is the main assertion.
    const results = [r1, r2];
    const successes = results.filter((r) => !isError(r));

    // At minimum 1 succeeds; ideally both do
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Verify file is not corrupted
    const disk = await fs.readFile(filePath, 'utf-8');
    // File should contain some CriticMarkup and not be empty/truncated
    expect(disk).toContain('# Concurrent Test');
    expect(disk.length).toBeGreaterThan(50);
  }, OP_TIMEOUT);
});
