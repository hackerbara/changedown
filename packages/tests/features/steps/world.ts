import { World, setWorldConstructor, Before, After } from '@cucumber/cucumber';
import {
  ScenarioContext,
  type ToolResult,
} from '../../mcp/features/scenario-context.js';
import {
  CriticMarkupParser,
  VirtualDocument,
} from '@changetracks/core';

/**
 * Cucumber World class for ChangeTracks BDD tests.
 *
 * Wraps ScenarioContext (MCP-level tests) and exposes direct access to
 * @changetracks/core functions (parser/operations tests).
 *
 * ScenarioContext is lazily initialized -- only created when a step
 * calls setupContext() or accesses an MCP tool method. This keeps
 * pure parser/core tests lightweight.
 */
export class ChangeTracksWorld extends World {
  /** MCP scenario context (lazy -- call setupContext() first) */
  ctx!: ScenarioContext;
  /** Last tool result from any MCP call */
  lastResult: ToolResult | null = null;
  /** Last error captured from a failing step */
  lastError: Error | null = null;
  /** Map of logical file names to temp-dir absolute paths */
  files: Map<string, string> = new Map();
  /** Config overrides accumulated by Given steps before context creation */
  configOverrides: Record<string, any> = {};
  /** Whether to enable guide delivery for this scenario */
  showGuide: boolean = false;
  /** Whether teardown was already performed by a step */
  tornDown: boolean = false;

  // --- Core-level test state (no ScenarioContext needed) ---
  /** Parser instance for core-level tests */
  parser: CriticMarkupParser = new CriticMarkupParser();
  /** Last parsed document */
  lastDoc: VirtualDocument | null = null;
  /** Last raw text (for core-level assertions) */
  lastText: string = '';

  /**
   * Lazily create and initialize the MCP ScenarioContext.
   * Config overrides accumulated before this call are applied.
   */
  async setupContext(): Promise<void> {
    this.ctx = new ScenarioContext(this.configOverrides, { showGuide: this.showGuide });
    await this.ctx.setup();
  }
}

setWorldConstructor(ChangeTracksWorld);

Before(async function (this: ChangeTracksWorld) {
  // Reset per-scenario state
  this.configOverrides = {};
  this.lastResult = null;
  this.lastError = null;
  this.files.clear();
  this.showGuide = false;
  this.tornDown = false;
  this.parser = new CriticMarkupParser();
  this.lastDoc = null;
  this.lastText = '';
});

After(async function (this: ChangeTracksWorld) {
  if (this.ctx && !this.tornDown) {
    await this.ctx.teardown();
  }
});
