#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  RootsListChangedNotificationSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { initHashline } from '@changetracks/core';
import {
  ConfigResolver,
  SessionState,
  handleProposeChange,
  handleBeginChangeGroup,
  handleEndChangeGroup,
  handleReviewChange,
  handleReviewChanges,
  handleRespondToThread,
  handleListOpenThreads,
  handleRawEdit,
  handleGetTrackingStatus,
  handleReadTrackedFile,
  handleGetChange,
  handleAmendChange,
  handleListChanges,
  handleSupersedeChange,
  handleProposeBatch,
  getListedToolsWithConfig,
  resolveProtocolMode,
} from 'changetracks/engine';

/**
 * Decode MCP root URIs (file://) to filesystem paths for the current platform.
 */
function rootUrisToPaths(roots: { uri: string }[]): string[] {
  const paths: string[] = [];
  for (const r of roots) {
    if (!r?.uri || !r.uri.startsWith('file://')) continue;
    try {
      paths.push(fileURLToPath(r.uri));
    } catch {
      // Skip malformed or unsupported URIs
    }
  }
  return paths;
}

/**
 * ChangeTracks MCP Server
 *
 * Exposes tracked-change tools over stdio. When the host supports MCP roots,
 * workspace root is taken from roots/list so relative paths resolve on first use.
 * Otherwise we fall back to env (CHANGETRACKS_PROJECT_DIR, PWD) and lazy discovery
 * via .changetracks/config.toml.
 */
async function main(): Promise<void> {
  // Initialize hashline WASM module (must happen before any hash operations)
  await initHashline();

  const fallbackDir =
    process.env['CHANGETRACKS_PROJECT_DIR'] ||
    process.env['PWD'] ||
    process.cwd();
  const resolver = new ConfigResolver(fallbackDir);
  const state = new SessionState();
  state.enableGuide();

  // Create MCP server
  const server = new Server(
    { name: 'changetracks', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // When the client sends initialized, fetch workspace roots if the host supports MCP roots.
  server.oninitialized = async () => {
    if (!server.getClientCapabilities()?.roots) return;
    try {
      const response = await server.listRoots();
      if (response?.roots?.length) {
        const paths = rootUrisToPaths(response.roots);
        if (paths.length) {
          resolver.setSessionRoots(paths);
          console.error(`changetracks: using ${paths.length} workspace root(s) from host`);
        }
      }
    } catch (err) {
      console.error('changetracks: failed to fetch MCP roots:', err instanceof Error ? err.message : String(err));
    }
  };

  // When the host notifies that roots changed (e.g. user switched workspace), refresh.
  server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
    if (!server.getClientCapabilities()?.roots) return;
    try {
      const response = await server.listRoots();
      if (response?.roots?.length) {
        const paths = rootUrisToPaths(response.roots);
        resolver.setSessionRoots(paths);
        console.error(`changetracks: refreshed ${paths.length} workspace root(s)`);
      }
    } catch (err) {
      console.error('changetracks: failed to refresh MCP roots:', err instanceof Error ? err.message : String(err));
    }
  });

  // Handle tools/list — enrich tool descriptions from project config so agent sees
  // e.g. "In this project author is required" before first write
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const config = await resolver.lastConfig();
    const mode = resolveProtocolMode(config.protocol.mode);
    return { tools: getListedToolsWithConfig(config, mode) };
  });

  // ── Tool dispatch ──────────────────────────────────────────────────
  //
  // Each handler returns { content: Array<{ type: 'text'; text: string }>; isError?: boolean },
  // which is structurally compatible with CallToolResult. The dispatch helper below
  // bridges the type gap so individual handlers don't need `as Promise<CallToolResult>` casts.

  type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

  /**
   * Dispatch a tool call to the appropriate handler and coerce the result
   * to CallToolResult. This eliminates `as Promise<CallToolResult>` casts
   * on every handler call.
   */
  async function dispatchTool(handler: ToolHandler, args: Record<string, unknown>): Promise<CallToolResult> {
    const result = await handler(args);
    return result as CallToolResult;
  }

  // Tool name → handler mapping. Includes both listed tools (exposed in tools/list)
  // and backward-compat aliases (handled but not listed).
  //
  // ── Backward-compatibility aliases ──────────────────────────────────
  // These 8 old tool names are still handled for agents that learned them
  // before the tool consolidation (ADR-045). They are NOT returned by
  // tools/list (see listed-tools.ts for the 7 listed tools).
  //
  //   Old tool name          → Maps to handler         Notes
  //   ─────────────────────  ──────────────────────── ──────────────────────────────
  //   get_change             → handleGetChange         Superseded by list_changes with detail=full
  //   propose_batch          → handleProposeBatch      Superseded by propose_change changes array
  //   begin_change_group     → handleBeginChangeGroup  Superseded by propose_change changes array
  //   end_change_group       → handleEndChangeGroup    Superseded by propose_change changes array
  //   review_change          → handleReviewChange      Superseded by review_changes (batch)
  //   respond_to_thread      → handleRespondToThread   Superseded by review_changes responses array
  //   list_open_threads      → handleListOpenThreads   Superseded by list_changes with status filter
  //   raw_edit               → handleRawEdit           Superseded by propose_change raw=true
  //   get_tracking_status    → handleGetTrackingStatus Superseded by read_tracked_file meta view
  //
  const toolHandlers: Record<string, ToolHandler> = {
    // ── Listed tools (6) ──
    propose_change:     (a) => handleProposeChange(a, resolver, state),
    review_changes:     (a) => handleReviewChanges(a, resolver, state),
    read_tracked_file:  (a) => handleReadTrackedFile(a, resolver, state),
    amend_change:       (a) => handleAmendChange(a, resolver, state),
    list_changes:       (a) => handleListChanges(a, resolver, state),
    supersede_change:   (a) => handleSupersedeChange(a, resolver, state),

    // ── Backward-compat aliases (9, not in tools/list) ──
    get_change:         (a) => handleGetChange(a, resolver),
    propose_batch:      (a) => handleProposeBatch(a, resolver, state),
    begin_change_group: (a) => handleBeginChangeGroup(a, resolver, state),
    end_change_group:   (a) => handleEndChangeGroup(a, resolver, state),
    review_change:      (a) => handleReviewChange(a, resolver, state),
    respond_to_thread:  (a) => handleRespondToThread(a, resolver, state),
    list_open_threads:  (a) => handleListOpenThreads(a, resolver, state),
    raw_edit:           (a) => handleRawEdit(a, resolver),
    get_tracking_status:(a) => handleGetTrackingStatus(a, resolver, state),
  };

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const handler = toolHandlers[name];

    if (handler) {
      return dispatchTool(handler, args ?? {});
    }

    return {
      content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Clean up watchers on shutdown
  server.onclose = () => resolver.dispose();

  // Log to stderr (stdout is reserved for JSON-RPC)
  console.error('changetracks MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
