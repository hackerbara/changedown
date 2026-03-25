import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { initHashline } from '@changetracks/core';
import { handleReadTrackedFile } from '@changetracks/mcp/internals';
import { handleProposeChange } from '@changetracks/mcp/internals';
import { handleReviewChanges } from '@changetracks/mcp/internals';
import { handleGetChange } from '@changetracks/mcp/internals';
import { handleAmendChange } from '@changetracks/mcp/internals';
import { SessionState } from '@changetracks/mcp/internals';
import { type ChangeTracksConfig } from '@changetracks/mcp/internals';
import { createTestResolver } from '../test-resolver.js';
import { type ConfigResolver } from '@changetracks/mcp/internals';

/**
 * Default config for BDD scenario tests. Differs from the package DEFAULT_CONFIG
 * in ways that make tests deterministic and explicit:
 * - hashline enabled (most BDD scenarios exercise coordinates)
 * - auto_on_approve/auto_on_reject disabled (settlement is explicit)
 * - reasoning optional (reduces boilerplate in simple scenarios)
 * - author set to 'ai:test-agent' (stable identity for assertions)
 */
export const DEFAULT_CONFIG: ChangeTracksConfig = {
  tracking: { include: ['**/*.md'], exclude: [], default: 'tracked', auto_header: false },
  author: { default: 'ai:test-agent', enforcement: 'optional' },
  hooks: { enforcement: 'warn', exclude: [] },
  matching: { mode: 'normalized' },
  hashline: { enabled: true, auto_remap: false },
  settlement: { auto_on_approve: false, auto_on_reject: false },
  policy: { mode: 'safety-net', creation_tracking: 'footnote' },
  protocol: { mode: 'classic', level: 2, reasoning: 'optional', batch_reasoning: 'required' },
};

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Reusable test context for BDD scenario tests. Wraps temp directory lifecycle,
 * config resolution, session state, and all five MCP tool handlers behind
 * ergonomic methods.
 *
 * Usage:
 * ```ts
 * const ctx = new ScenarioContext();
 * await ctx.setup();
 * // ... run scenario steps ...
 * await ctx.teardown();
 * ```
 */
export class ScenarioContext {
  tmpDir!: string;
  state!: SessionState;
  resolver!: ConfigResolver;
  private config: ChangeTracksConfig;
  private prefix: string;

  private showGuide: boolean;

  constructor(config?: Partial<ChangeTracksConfig>, opts?: { prefix?: string; showGuide?: boolean }) {
    const prefix = opts?.prefix ?? 'ct-bdd-';
    this.showGuide = opts?.showGuide ?? false;
    this.config = { ...DEFAULT_CONFIG, ...config } as ChangeTracksConfig;
    if (config?.tracking) this.config.tracking = { ...DEFAULT_CONFIG.tracking, ...config.tracking };
    if (config?.author) this.config.author = { ...DEFAULT_CONFIG.author, ...config.author };
    if (config?.hooks) this.config.hooks = { ...DEFAULT_CONFIG.hooks, ...config.hooks };
    if (config?.matching) this.config.matching = { ...DEFAULT_CONFIG.matching, ...config.matching };
    if (config?.hashline) this.config.hashline = { ...DEFAULT_CONFIG.hashline, ...config.hashline };
    if (config?.settlement) this.config.settlement = { ...DEFAULT_CONFIG.settlement, ...config.settlement };
    if (config?.policy) this.config.policy = { ...DEFAULT_CONFIG.policy, ...config.policy };
    if (config?.protocol) this.config.protocol = { ...DEFAULT_CONFIG.protocol, ...config.protocol };
    if (config?.response) this.config.response = { ...this.config.response, ...config.response };
    this.prefix = prefix;
  }

  async setup(): Promise<void> {
    await initHashline();
    this.tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), this.prefix));
    this.state = new SessionState();
    if (this.showGuide) this.state.enableGuide();
    this.resolver = await createTestResolver(this.tmpDir, this.config);
  }

  /**
   * Reconfigure the context with new config overrides without recreating
   * the temp directory or files. Useful when a Cucumber scenario needs to
   * change config after Background steps have already created files.
   */
  async reconfigure(overrides: Partial<ChangeTracksConfig>): Promise<void> {
    // Apply overrides on top of existing config
    if (overrides.tracking) this.config.tracking = { ...this.config.tracking, ...overrides.tracking };
    if (overrides.author) this.config.author = { ...this.config.author, ...overrides.author };
    if (overrides.hooks) this.config.hooks = { ...this.config.hooks, ...overrides.hooks };
    if (overrides.matching) this.config.matching = { ...this.config.matching, ...overrides.matching };
    if (overrides.hashline) this.config.hashline = { ...this.config.hashline, ...overrides.hashline };
    if (overrides.settlement) this.config.settlement = { ...this.config.settlement, ...overrides.settlement };
    if (overrides.policy) this.config.policy = { ...this.config.policy, ...overrides.policy };
    if (overrides.protocol) this.config.protocol = { ...this.config.protocol, ...overrides.protocol };
    if (overrides.response) this.config.response = { ...this.config.response, ...overrides.response };
    // Rebuild the resolver with the new config (same tmpDir)
    this.resolver = await createTestResolver(this.tmpDir, this.config);
  }

  async teardown(): Promise<void> {
    await fs.rm(this.tmpDir, { recursive: true, force: true });
  }

  /** Create a file in the temp directory */
  async createFile(name: string, content: string): Promise<string> {
    const filePath = path.join(this.tmpDir, name);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  }

  /** Read file content from disk */
  async readDisk(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  /** Call read_tracked_file */
  async read(file: string, opts?: {
    view?: string;
    offset?: number;
    limit?: number;
    include_meta?: boolean;
    include_guide?: boolean;
  }): Promise<ToolResult> {
    return handleReadTrackedFile(
      { file, ...opts },
      this.resolver,
      this.state,
    );
  }

  /** Call propose_change (single or batch) */
  async propose(file: string, opts: {
    old_text?: string;
    new_text?: string;
    insert_after?: string;
    reason?: string;
    author?: string;
    raw?: boolean;
    changes?: Array<{
      old_text: string;
      new_text: string;
      reason?: string;
      insert_after?: string;
    }>;
    // hashline params
    start_line?: number;
    start_hash?: string;
    end_line?: number;
    end_hash?: string;
    after_line?: number;
    after_hash?: string;
  }): Promise<ToolResult> {
    return handleProposeChange(
      { file, ...opts },
      this.resolver,
      this.state,
    );
  }

  /** Call review_changes */
  async review(file: string, opts: {
    reviews?: Array<{
      change_id: string;
      decision: 'approve' | 'reject' | 'request_changes';
      reason: string;
    }>;
    responses?: Array<{
      change_id: string;
      response: string;
      label?: string;
    }>;
    author?: string;
    settle?: boolean;
  }): Promise<ToolResult> {
    return handleReviewChanges(
      { file, ...opts },
      this.resolver,
      this.state,
    );
  }

  /** Call get_change */
  async getChange(file: string, changeId: string, opts?: {
    context_lines?: number;
    include_raw_footnote?: boolean;
  }): Promise<ToolResult> {
    return handleGetChange(
      { file, change_id: changeId, ...opts },
      this.resolver,
    );
  }

  /** Call amend_change */
  async amend(file: string, changeId: string, opts: {
    new_text?: string;
    reason?: string;
    author?: string;
  }): Promise<ToolResult> {
    return handleAmendChange(
      { file, change_id: changeId, ...opts },
      this.resolver,
      this.state,
    );
  }

  /** Parse JSON from tool result text */
  parseResult(result: ToolResult): Record<string, unknown> {
    return JSON.parse(result.content[0].text);
  }

  /** Extract text from tool result */
  resultText(result: ToolResult): string {
    return result.content[0].text;
  }

  /** Assert footnote contains expected status (pipe-delimited 4th field) */
  async assertFootnoteStatus(filePath: string, changeId: string, status: string): Promise<void> {
    const content = await this.readDisk(filePath);
    const footnoteRef = `[^${changeId}]`;
    const footnoteIdx = content.indexOf(footnoteRef + ':');
    if (footnoteIdx === -1) throw new Error(`Footnote ${footnoteRef} not found in file`);
    const afterRef = content.slice(footnoteIdx);
    const firstLine = afterRef.split('\n')[0];
    // Footnote format: [^ct-N]: @author | date | type | status
    // Parse the pipe-delimited 4th field for exact status match
    const parts = firstLine.split('|');
    if (parts.length < 4) {
      throw new Error(`Footnote ${changeId} has unexpected format (expected 4+ pipe-delimited fields): ${firstLine}`);
    }
    const actualStatus = parts[3].trim();
    if (actualStatus !== status) {
      throw new Error(`Footnote ${changeId} expected status "${status}" but got "${actualStatus}" in: ${firstLine}`);
    }
  }

  /** Assert no CriticMarkup delimiters in the document body (before footnotes) */
  async assertNoMarkupInBody(filePath: string): Promise<void> {
    const content = await this.readDisk(filePath);
    const footnoteStart = content.indexOf('\n[^ct-');
    const body = footnoteStart >= 0 ? content.slice(0, footnoteStart) : content;
    const delimiters = ['{++', '++}', '{--', '--}', '{~~', '~~}', '{==', '==}', '{>>', '<<}'];
    for (const d of delimiters) {
      if (body.includes(d)) {
        throw new Error(`Found CriticMarkup delimiter "${d}" in document body`);
      }
    }
  }

  /** Extract LINE:HASH from read output.
   *
   * Handles three hashline formats:
   *  - Standard:  `N:HH|content`       (hash directly followed by pipe)
   *  - Dual hash: `N:HH.SS|content`    (raw.settled hashes separated by dot)
   *  - Committed: `N:HHF|content`      (hash + flag char [space/P/A] + pipe)
   */
  extractLineHash(readText: string, lineContent: string): { line: number; hash: string } | null {
    const escaped = lineContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match LINE:HASH followed by optional flag/dot then pipe, then the line content
    const regex = new RegExp(`\\b(\\d+):([0-9a-f]{2,4})[. PA|].*${escaped}`);
    const match = readText.match(regex);
    if (!match) return null;
    return { line: parseInt(match[1], 10), hash: match[2] };
  }
}
