import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_CONFIG, SessionState, type ChangeDownConfig } from '@changedown/cli/engine/browser';
import { version } from '../version.js';
import {
  handleWordListChanges,
  handleWordProposeChange,
  handleWordReadTrackedFile,
  handleWordSupersedeChange,
} from '../word-document-workflow.js';
import { synthesizeRemoteAuthorFromClientInfo } from './remote-author.js';
import { getRemoteWordTools, MUTATING_REMOTE_TOOL_NAMES, REMOTE_WORD_TOOL_NAMES, type RemoteWordToolName } from './remote-tool-list.js';
import { lowerRemoteToolToBackendWire } from './backend-wire-lowering.js';
import { RoomDocumentBackend } from './room-document-backend.js';
import type { RelayRequestContext } from './relay-context.js';

const MUTATING_REMOTE_TOOLS = new Set<RemoteWordToolName>(MUTATING_REMOTE_TOOL_NAMES);
const WORKFLOW_REMOTE_TOOLS = new Set<RemoteWordToolName>(['read_tracked_file', 'list_changes', 'propose_change', 'supersede_change']);
const fallbackRemoteStates = new Map<string, SessionState>();

function isRemoteWordToolName(name: string): name is RemoteWordToolName {
  return (REMOTE_WORD_TOOL_NAMES as readonly string[]).includes(name);
}

function ensureDefaultAuthor(args: Record<string, unknown>, ctx: RelayRequestContext): Record<string, unknown> {
  if (Object.hasOwn(args, 'author')) return args;
  const author = synthesizeRemoteAuthorFromClientInfo(ctx.clientInfo);
  return author ? { ...args, author } : args;
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function isCallToolResult(result: unknown): result is CallToolResult {
  if (!result || typeof result !== 'object') return false;
  if (!('content' in result)) return false;
  return Array.isArray((result as { content?: unknown }).content);
}

function snapshotTextResult(result: CallToolResult): CallToolResult {
  if (result.isError === true || result.content.length !== 1) return result;
  const item = result.content[0];
  if (item.type !== 'text') return result;
  try {
    const snapshot = JSON.parse(item.text) as { text?: unknown; format?: unknown; version?: unknown };
    if (typeof snapshot.text !== 'string') return result;
    const structuredContent: Record<string, unknown> = {};
    if (typeof snapshot.format === 'string') structuredContent.format = snapshot.format;
    if (typeof snapshot.version === 'string') structuredContent.version = snapshot.version;
    return {
      ...result,
      content: [{ type: 'text', text: snapshot.text }],
      structuredContent: Object.keys(structuredContent).length > 0 ? structuredContent : result.structuredContent,
    };
  } catch {
    return result;
  }
}

function textResult(result: unknown): CallToolResult {
  const text = typeof result === 'string' ? result : JSON.stringify(result) ?? String(result);
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

function isWordSessionTarget(args: Record<string, unknown>): boolean {
  return typeof args.file === 'string' && args.file.startsWith('word://');
}

function hasUsableIdempotencyKey(args: Record<string, unknown>): boolean {
  return typeof args.idempotency_key === 'string' && args.idempotency_key.trim().length > 0;
}

function idempotencyKey(args: Record<string, unknown>): string | undefined {
  const raw = args.idempotency_key;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

function stripTransportArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { idempotency_key: _idempotency, ...rest } = args;
  return rest;
}

function getFallbackState(key: string): SessionState {
  let state = fallbackRemoteStates.get(key);
  if (!state) {
    state = new SessionState();
    state.enableGuide();
    fallbackRemoteStates.set(key, state);
  }
  return state;
}

function workflowStateFor(ctx: RelayRequestContext, uri: string): SessionState {
  const key = `${ctx.auth.roomId}:${ctx.auth.role}:${ctx.clientInfo?.name ?? 'unknown'}:${uri}`;
  return ctx.workflowState?.get(key) ?? getFallbackState(key);
}

function workflowConfig(_ctx: RelayRequestContext): ChangeDownConfig {
  return DEFAULT_CONFIG;
}

export function createRemoteRelayServer(ctx: RelayRequestContext): Server {
  const server = new Server(
    { name: 'changedown-remote-word', version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: getRemoteWordTools('compact') }));

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const name = request.params.name;
    if (!isRemoteWordToolName(name)) return errorResult(`Unknown tool: ${name}`);

    const isMutatingTool = MUTATING_REMOTE_TOOLS.has(name);
    if (isMutatingTool && ctx.auth.role === 'read') {
      return errorResult('ForbiddenReadOnlyRole: this relay token cannot call remote write tools.');
    }

    const args = ensureDefaultAuthor({ ...(request.params.arguments ?? {}) }, ctx);
    if (!isWordSessionTarget(args)) {
      return errorResult('RemoteWordTargetRequired: remote relay tools only accept active Word session URIs beginning with word://.');
    }
    if (isMutatingTool && !hasUsableIdempotencyKey(args)) {
      return errorResult('IdempotencyKeyRequired: remote write tools require a non-empty idempotency_key. The HTTP facade injects this from Idempotency-Key or X-Idempotency-Key.');
    }

    if (WORKFLOW_REMOTE_TOOLS.has(name)) {
      const uri = String(args.file);
      const backend = new RoomDocumentBackend(ctx.room, { idempotencyKey: idempotencyKey(args) });
      const workflowArgs = stripTransportArgs(args);
      const config = workflowConfig(ctx);
      const state = workflowStateFor(ctx, uri);

      if (name === 'read_tracked_file') {
        return handleWordReadTrackedFile({ backend, uri, args: workflowArgs, config, state });
      }
      if (name === 'list_changes') {
        return handleWordListChanges({ backend, uri, args: workflowArgs, config, state });
      }
      if (name === 'supersede_change') {
        return handleWordSupersedeChange({ backend, uri, args: workflowArgs, config, state });
      }
      return handleWordProposeChange({ backend, uri, args: workflowArgs, config, state });
    }

    const lowered = lowerRemoteToolToBackendWire(name, args);
    if ('error' in lowered) return errorResult(lowered.error);

    const result = await ctx.room.callBackendOperation(lowered.request, { idempotencyKey: lowered.idempotencyKey });
    const toolResult = isCallToolResult(result) ? result : textResult(result);
    return name === 'read_tracked_file' ? snapshotTextResult(toolResult) : toolResult;
  });

  return server;
}
