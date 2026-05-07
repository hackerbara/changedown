import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  computeLineHash,
  ensureHashlineReady,
  buildViewDocument,
  computeOriginalText,
  applyRejectedChanges,
  computeSupersedeResult,
  countFootnoteHeadersWithStatus,
  formatPlainText,
  parseForFormat,
  findFootnoteBlock,
  parseFootnoteHeader,
  type ChangeNode,
  type VirtualDocument,
} from '@changedown/core';
import { resolveView } from '@changedown/core/host';
import {
  composeGuide,
  rerecordState,
  resolveProtocolMode,
  errorResult,
  resolveAuthor,
  TYPE_MAP,
  offsetToLineNumber,
  type ChangeDownConfig,
} from '@changedown/cli/engine/browser';
import type { DocumentBackend } from '@changedown/core/backend';

import { applyPreparedWordProposeChange, prepareWordProposeChange } from './word-propose.js';

export interface WordDocumentWorkflowInput {
  backend: DocumentBackend;
  uri: string;
  args: Record<string, unknown>;
  config: ChangeDownConfig;
  state: {
    recordAfterRead(filePath: string, view: string, hashes: Array<{ line: number; raw: string; committed?: string; currentView?: string; rawLineNum?: number }>, rawContent: string): void;
  };
}

type WordListChangeSummary = {
  change_id: string;
  type: string;
  status: string;
  author: string;
  line: number;
  preview: string;
  level: 0 | 1 | 2;
  anchored: boolean;
  resolved: boolean;
  consumed_by?: string;
};

type WordListChangeContext = WordListChangeSummary & {
  markup: string;
  original_text: string | null;
  modified_text: string | null;
  context_before: string[];
  context_after: string[];
};

type WordListChangeFullDetail = WordListChangeContext & {
  footnote: {
    author: string;
    date: string;
    reasoning: string | null;
    discussion_count: number;
    approvals: string[];
    rejections: string[];
    request_changes: string[];
  };
  participants: string[];
  group: {
    parent_id: string;
    description: string | null;
    siblings: string[];
  } | null;
};

const MAX_WORD_LIST_PREVIEW_LENGTH = 80;

function buildWordListPreview(change: ChangeNode): string {
  let preview = '';
  switch (change.type) {
    case 'Substitution':
      preview = `${change.originalText ?? ''}~>${change.modifiedText ?? ''}`;
      break;
    case 'Insertion':
      preview = change.modifiedText ?? '';
      break;
    case 'Deletion':
      preview = change.originalText ?? '';
      break;
    default:
      preview = change.originalText ?? change.modifiedText ?? '';
      break;
  }
  if (preview.length > MAX_WORD_LIST_PREVIEW_LENGTH) {
    return preview.slice(0, MAX_WORD_LIST_PREVIEW_LENGTH - 3) + '...';
  }
  return preview;
}

function effectiveChangeStatus(change: ChangeNode): string {
  return (change.metadata?.status ?? change.inlineMetadata?.status ?? change.status).toString().toLowerCase();
}

function buildWordSummaryEntry(change: ChangeNode, text: string): WordListChangeSummary {
  return {
    change_id: change.id,
    type: TYPE_MAP[change.type],
    status: effectiveChangeStatus(change),
    author: change.metadata?.author ?? change.inlineMetadata?.author ?? '',
    line: offsetToLineNumber(text, change.range.start),
    preview: buildWordListPreview(change),
    level: change.level,
    anchored: change.anchored,
    resolved: change.resolved ?? true,
    ...(change.consumedBy ? { consumed_by: change.consumedBy } : {}),
  };
}

function buildWordContextEntry(
  change: ChangeNode,
  text: string,
  lines: string[],
  summary: WordListChangeSummary,
  contextN: number,
): WordListChangeContext {
  const startLine = offsetToLineNumber(text, change.range.start);
  const endLine = offsetToLineNumber(text, change.range.end);
  return {
    ...summary,
    markup: text.slice(change.range.start, change.range.end),
    original_text: change.type === 'Insertion' ? null : (change.originalText ?? null),
    modified_text: change.type === 'Deletion' ? null : (change.modifiedText ?? null),
    context_before: lines.slice(Math.max(0, startLine - 1 - contextN), startLine - 1),
    context_after: lines.slice(endLine, Math.min(lines.length, endLine + contextN)),
  };
}

function buildWordFullDetailEntry(
  change: ChangeNode,
  text: string,
  lines: string[],
  doc: VirtualDocument,
  summary: WordListChangeSummary,
  contextN: number,
): WordListChangeFullDetail {
  const ctx = buildWordContextEntry(change, text, lines, summary, contextN);
  const meta = change.metadata;
  const participants = new Set<string>();
  if (meta?.author) participants.add(meta.author);
  meta?.discussion?.forEach((d) => participants.add(d.author));
  meta?.approvals?.forEach((a) => participants.add(a.author));
  meta?.rejections?.forEach((a) => participants.add(a.author));
  meta?.requestChanges?.forEach((a) => participants.add(a.author));

  let group: WordListChangeFullDetail['group'] = null;
  const dotIndex = change.id.lastIndexOf('.');
  if (dotIndex > 0) {
    const parentId = change.id.slice(0, dotIndex);
    const parentBlock = findFootnoteBlock(lines, parentId);
    let description: string | null = null;
    if (parentBlock) {
      for (let i = parentBlock.headerLine + 1; i <= parentBlock.blockEnd; i++) {
        const trimmed = lines[i]?.trim() ?? '';
        if (trimmed.startsWith('reason:') || trimmed.startsWith('context:')) continue;
        if (trimmed && !trimmed.startsWith('approved:') && !trimmed.startsWith('rejected:') && !trimmed.startsWith('request-changes:')) {
          description = trimmed;
          break;
        }
      }
    }
    const siblings = doc
      .getChanges()
      .filter((c) => (c.groupId === parentId || c.id.startsWith(parentId + '.')) && c.id !== parentId)
      .map((c) => c.id);
    group = { parent_id: parentId, description, siblings };
  }

  return {
    ...ctx,
    footnote: {
      author: meta?.author ?? '',
      date: meta?.date ?? '',
      reasoning: meta?.discussion?.[0]?.text ?? null,
      discussion_count: meta?.discussion?.length ?? 0,
      approvals: (meta?.approvals ?? []).map((a) => a.author),
      rejections: (meta?.rejections ?? []).map((a) => a.author),
      request_changes: (meta?.requestChanges ?? []).map((a) => a.author),
    },
    participants: [...participants],
    group,
  };
}

function buildWordDetailForLevel(
  detail: string,
  change: ChangeNode,
  text: string,
  lines: string[],
  doc: VirtualDocument,
  summary: WordListChangeSummary,
  contextN: number,
): WordListChangeSummary | WordListChangeContext | WordListChangeFullDetail {
  switch (detail) {
    case 'context':
      return buildWordContextEntry(change, text, lines, summary, contextN);
    case 'full':
      return buildWordFullDetailEntry(change, text, lines, doc, summary, contextN);
    default:
      return summary;
  }
}

async function buildWordListChangesResponse(
  backend: DocumentBackend,
  uri: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const snapshot = await backend.read({ uri });
  const text = snapshot.text;
  const doc = parseForFormat(text);
  const allChanges = doc.getChanges();
  const lines = text.split('\n');
  const statusFilter = typeof args.status === 'string' ? args.status : undefined;
  const changeIdArg = typeof args.change_id === 'string' ? args.change_id : undefined;
  const changeIdsArg = Array.isArray(args.change_ids) ? args.change_ids.filter((id): id is string => typeof id === 'string') : undefined;
  const hasIds = !!(changeIdArg || (changeIdsArg && changeIdsArg.length > 0));
  const detail = typeof args.detail === 'string' ? args.detail : (hasIds ? 'full' : 'summary');
  const contextN = Math.max(0, typeof args.context_lines === 'number' ? args.context_lines : 3);
  const includeNativeDiagnostics = args.debug === true || args.diagnostics === true || args.native === true;
  const nativeChanges = includeNativeDiagnostics
    ? await backend.listChanges({ uri }, args).catch(() => undefined)
    : undefined;

  if (hasIds) {
    const targetIds = new Set<string>();
    if (changeIdArg) targetIds.add(changeIdArg);
    changeIdsArg?.forEach((id) => targetIds.add(id));

    const changeMap = new Map(allChanges.map((change) => [change.id, change]));
    const results: Array<WordListChangeSummary | WordListChangeContext | WordListChangeFullDetail | { change_id: string; error: string }> = [];
    for (const id of targetIds) {
      const change = changeMap.get(id);
      if (!change) {
        const settledBlock = findFootnoteBlock(lines, id);
        if (settledBlock) {
          const header = parseFootnoteHeader(settledBlock.headerContent);
          results.push({ change_id: id, error: `Change settled (status: ${header?.status ?? 'unknown'})` });
        } else {
          results.push({ change_id: id, error: 'Change not found' });
        }
        continue;
      }
      const summary = buildWordSummaryEntry(change, text);
      results.push(buildWordDetailForLevel(detail, change, text, lines, doc, summary, contextN));
    }

    return {
      file: uri,
      total_count: allChanges.length,
      filtered_count: results.length,
      changes: results,
      ...(nativeChanges ? { native_changes: nativeChanges } : {}),
      diagnostics: doc.getDiagnostics(),
    };
  }

  const entries = allChanges.map((change) => {
    const summary = buildWordSummaryEntry(change, text);
    return buildWordDetailForLevel(detail, change, text, lines, doc, summary, contextN);
  });
  const filtered = statusFilter
    ? entries.filter((entry) => 'status' in entry && entry.status === statusFilter)
    : entries;

  return {
    file: uri,
    total_count: entries.length,
    filtered_count: filtered.length,
    changes: filtered,
    ...(nativeChanges ? { native_changes: nativeChanges } : {}),
    diagnostics: doc.getDiagnostics(),
  };
}

export async function handleWordReadTrackedFile(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args, config, state } = input;
  try {
    await ensureHashlineReady();
    const snapshot = await backend.read({ uri });

    const DEFAULT_LIMIT = 500;
    const MAX_LIMIT = 2000;
    const requestedView = typeof args.view === 'string' ? args.view : undefined;
    const offset = typeof args.offset === 'number' ? args.offset : 1;
    const requestedLimit = typeof args.limit === 'number' ? args.limit : undefined;

    const resolvedView = requestedView !== undefined ? resolveView(requestedView) : null;
    if (requestedView !== undefined && resolvedView === null) {
      return errorResult(
        `Unknown view '${requestedView}'. Valid views: working, simple, decided, original, raw`,
      ) as CallToolResult;
    }

    const defaultView = resolveView(config.policy.default_view ?? 'working') ?? 'working';
    const viewPolicy = config.policy.view_policy ?? 'suggest';
    const canonicalView = requestedView === undefined
      ? defaultView
      : resolvedView!;

    if (viewPolicy === 'require' && canonicalView !== defaultView) {
      return errorResult(
        `This project requires view "${config.policy.default_view}" (view_policy = "require"). ` +
        `Requested view "${requestedView}" is not allowed.`,
      ) as CallToolResult;
    }

    const protocolMode = resolveProtocolMode(config.protocol.mode);

    const viewSourceText = canonicalView === 'original' ? computeOriginalText(snapshot.text) : snapshot.text;
    const buildableView = canonicalView === 'original' ? 'working' : canonicalView;
    const doc = buildViewDocument(viewSourceText, buildableView, {
      filePath: uri,
      trackingStatus: 'tracked',
      protocolMode,
      defaultView,
      viewPolicy,
    });

    let sessionHashes = doc.lines.map((l) => ({
      line: l.margin.lineNumber,
      raw: l.sessionHashes.raw,
      committed: l.sessionHashes.committed,
      currentView: l.sessionHashes.currentView,
      rawLineNum: l.rawLineNumber,
    }));
    let syntheticBlankAnchor: string | null = null;
    if (doc.lines.length === 0 && (canonicalView === 'working' || canonicalView === 'simple')) {
      const rawLines = viewSourceText.split('\n');
      const rawLineIndex = rawLines.findIndex((line) => line.trim() === '');
      const rawLineNum = rawLineIndex >= 0 ? rawLineIndex + 1 : 1;
      const rawLine = rawLines[rawLineNum - 1] ?? '';
      const hash = computeLineHash(rawLineNum - 1, rawLine, rawLines);
      syntheticBlankAnchor = ` 1:${hash}  | `;
      sessionHashes = [{
        line: 1,
        raw: hash,
        committed: hash,
        currentView: hash,
        rawLineNum,
      }];
    }
    state.recordAfterRead(uri, canonicalView, sessionHashes, viewSourceText);

    const totalLines = doc.lines.length;
    const effectiveStart = Math.max(1, offset);
    const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const effectiveEnd = Math.min(effectiveStart + limit - 1, totalLines);

    let adjustedEnd = effectiveEnd;
    while (adjustedEnd < doc.lines.length && doc.lines[adjustedEnd]?.continuesChange) {
      adjustedEnd++;
    }

    const paginatedDoc = {
      ...doc,
      lines: doc.lines.slice(effectiveStart - 1, adjustedEnd),
      header: {
        ...doc.header,
        lineRange: { start: effectiveStart, end: adjustedEnd, total: totalLines },
      },
    };

    let output = formatPlainText(paginatedDoc);
    if (syntheticBlankAnchor !== null) {
      output = output.endsWith('---')
        ? `${output}\n${syntheticBlankAnchor}`
        : `${output}\n${syntheticBlankAnchor}`;
    }

    if (adjustedEnd < totalLines) {
      output += `\n\n--- showing lines ${effectiveStart}-${adjustedEnd} of ${totalLines} | use offset/limit to paginate ---`;
    }

    const guide = args.include_guide === true ? `\n\n${composeGuide(config, { targetKind: 'word' })}` : '';
    const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: output }];
    if (guide) content.unshift({ type: 'text', text: guide });
    return { content } as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}

export async function handleWordListChanges(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args } = input;
  try {
    await ensureHashlineReady();
    const response = await buildWordListChangesResponse(backend, uri, args);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(response) }],
    } as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}

export async function handleWordSupersedeChange(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args, config, state } = input;
  try {
    await ensureHashlineReady();
    const changeId = typeof args.change_id === 'string' ? args.change_id : typeof args.changeId === 'string' ? args.changeId : undefined;
    const oldText = typeof args.old_text === 'string' ? args.old_text : typeof args.oldText === 'string' ? args.oldText : undefined;
    const newText = typeof args.new_text === 'string' ? args.new_text : typeof args.newText === 'string' ? args.newText : undefined;
    const insertAfter = typeof args.insert_after === 'string' ? args.insert_after : typeof args.insertAfter === 'string' ? args.insertAfter : undefined;
    const reason = typeof args.reason === 'string' ? args.reason : undefined;

    if (!changeId) return errorResult('Missing required argument: "change_id"') as CallToolResult;
    if (oldText === undefined) return errorResult('Missing required argument: "old_text"') as CallToolResult;
    if (newText === undefined) return errorResult('Missing required argument: "new_text"') as CallToolResult;
    if (oldText === '' && newText === '') return errorResult('Both old_text and new_text are empty — nothing to change.') as CallToolResult;

    const { author, error: authorError } = resolveAuthor(args.author as string | undefined, config, 'supersede_change');
    if (authorError) return errorResult(authorError.message) as CallToolResult;

    const snapshot = await backend.read({ uri });
    const result = await computeSupersedeResult(snapshot.text, changeId, {
      oldText,
      newText,
      insertAfter,
      reason,
      author,
    });
    if (result.isError) return errorResult(result.error) as CallToolResult;

    let newL2 = result.text;
    if (config.settlement.auto_on_reject) {
      const settled = applyRejectedChanges(newL2);
      newL2 = settled.currentContent;
    }

    const applied = await backend.applyChange({ uri }, {
      kind: 'propose',
      args: { oldL2: snapshot.text, newL2 },
    });
    if (applied.applied === false) {
      return errorResult(applied.text ?? 'Word adapter did not apply prepared supersede') as CallToolResult;
    }

    await rerecordState(state as never, uri, newL2, config);

    const footnoteCount = (newL2.match(/^\[\^cn-\d+(?:\.\d+)?\]:/gm) || []).length;
    const responseData = {
      old_change_id: changeId,
      new_change_id: result.newChangeId,
      file: uri,
      type: oldText === '' ? 'ins' : newText === '' ? 'del' : 'sub',
      supersedes: changeId,
      document_state: {
        total_changes: footnoteCount,
        proposed: countFootnoteHeadersWithStatus(newL2, 'proposed'),
        accepted: countFootnoteHeadersWithStatus(newL2, 'accepted'),
        rejected: countFootnoteHeadersWithStatus(newL2, 'rejected'),
      },
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(responseData) }] } as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}

export async function handleWordProposeChange(input: WordDocumentWorkflowInput): Promise<CallToolResult> {
  const { backend, uri, args, config, state } = input;
  try {
    await ensureHashlineReady();
    if (Object.prototype.hasOwnProperty.call(args, 'word_spike_direct') || Object.prototype.hasOwnProperty.call(args, 'word_author_spike') || Object.prototype.hasOwnProperty.call(args, 'spike')) {
      return errorResult('word_spike_direct/word_author_spike/spike are diagnostic-only and are not supported by public word:// propose_change') as CallToolResult;
    }

    const snapshot = await backend.read({ uri });
    const prepared = await prepareWordProposeChange({
      args,
      uri,
      snapshotText: snapshot.text,
      config,
      state,
    });
    if (!prepared.ok) return prepared.toolResult as CallToolResult;

    const result = await applyPreparedWordProposeChange(backend, uri, prepared);
    if (result.applied === false) {
      return errorResult(result.text ?? 'Word adapter did not apply prepared proposal') as CallToolResult;
    }

    try {
      const after = await backend.read({ uri });
      await rerecordState(state as never, uri, after.text, config);
    } catch {
      await rerecordState(state as never, uri, prepared.newL2, config);
    }

    return prepared.toolResult as CallToolResult;
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err)) as CallToolResult;
  }
}
