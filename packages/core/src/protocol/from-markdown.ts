import { ChangeStatus, ChangeType, type ChangeNode } from '../model/types.js';
import { parseForFormat } from '../format-aware-parse.js';
import { splitBodyAndFootnotes } from '../footnote-patterns.js';
import { buildChangeDownProtocolDocument } from './protocol-document.js';
import type {
  ChangeDownProtocolDocument,
  PublicActionabilityState,
  PublicAnchorKind,
  PublicChangeEntry,
  PublicChangeKind,
  PublicChangeRepresentation,
  PublicChangeStatus,
} from './types.js';
import type { ChangeId } from './row-identity-registry.js';

export function buildProtocolDocumentFromMarkdown(source: string): ChangeDownProtocolDocument {
  const doc = parseForFormat(source);
  const parsedFootnotes = parseProtocolFootnotes(source);
  const changesById = new Map(doc.getChanges().map((change) => [change.id as ChangeId, change]));
  const ids = orderedProtocolIds(source, parsedFootnotes, changesById);
  const body = splitBodyAndFootnotes(source.split('\n')).bodyLines.join('\n');
  const entries: PublicChangeEntry[] = ids.map((id) => {
    const change = changesById.get(id);
    const parsed = parsedFootnotes.get(id);
    const anchors = parsed?.anchors?.length
      ? parsed.anchors
      : [defaultAnchorForChange(id, change, body)];
    const metadata = { ...(parsed?.protocolMetadata ?? {}) };
    return {
      id,
      kind: parsed?.kind ?? (change ? publicKindFromChangeType(change.type) : 'metadata'),
      status: parsed?.status ?? publicStatusForChange(change),
      representation: parsed?.representation ?? (change ? 'inline-markup' : 'metadata-anchor'),
      anchors,
      actionability: parsed?.actionability ?? { state: 'protocol-ready' },
      ...(parsed?.author ?? change?.metadata?.author ?? change?.inlineMetadata?.author ? { author: String(parsed?.author ?? change?.metadata?.author ?? change?.inlineMetadata?.author) } : {}),
      ...(parsed?.date ?? change?.metadata?.date ?? change?.inlineMetadata?.date ? { date: String(parsed?.date ?? change?.metadata?.date ?? change?.inlineMetadata?.date) } : {}),
      ...(parsed?.parentId ? { parentId: parsed.parentId } : {}),
      ...(parsed?.children?.length ? { children: parsed.children } : {}),
      protocolMetadata: metadata,
    };
  });
  return buildChangeDownProtocolDocument({ backendKind: 'file-markdown', body, entries });
}

function orderedProtocolIds(
  source: string,
  parsedFootnotes: ReadonlyMap<ChangeId, ParsedProtocolFootnote>,
  changesById: ReadonlyMap<ChangeId, unknown>,
): ChangeId[] {
  const ids: ChangeId[] = [];
  const seen = new Set<ChangeId>();
  for (const match of source.matchAll(/\[\^(cn-\d+)\]/gu)) {
    const id = match[1] as ChangeId;
    if ((parsedFootnotes.has(id) || changesById.has(id)) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const id of parsedFootnotes.keys()) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  for (const id of changesById.keys()) {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

interface ParsedProtocolFootnote {
  author?: string;
  date?: string;
  kind?: PublicChangeKind;
  status?: PublicChangeStatus;
  representation?: PublicChangeRepresentation;
  actionability?: { state: PublicActionabilityState; reason?: string };
  anchors?: Array<{ kind: PublicAnchorKind; marker: string }>;
  parentId?: ChangeId;
  children?: ChangeId[];
  protocolMetadata?: Record<string, string>;
}

function parseProtocolFootnotes(source: string): Map<ChangeId, ParsedProtocolFootnote> {
  const lines = source.split('\n');
  const result = new Map<ChangeId, ParsedProtocolFootnote>();
  let currentId: ChangeId | undefined;
  for (const line of lines) {
    const header = line.match(/^\[\^(cn-\d+)\]:\s*(.*)$/u);
    if (header) {
      currentId = header[1] as ChangeId;
      const parts = header[2].split('|').map((part) => part.trim()).filter(Boolean);
      const current: ParsedProtocolFootnote = { protocolMetadata: {} };
      if (parts[0]) current.author = parts[0];
      if (parts[1] && /^\d{4}-\d{2}-\d{2}/u.test(parts[1])) current.date = parts[1];
      const kindPart = parts.find((part) => isPublicKind(part));
      const statusPart = parts.find((part) => isPublicStatus(part));
      if (kindPart) current.kind = kindPart as PublicChangeKind;
      if (statusPart) current.status = statusPart as PublicChangeStatus;
      result.set(currentId, current);
      continue;
    }
    if (!currentId) continue;
    const field = line.match(/^\s{4}([^:]+):\s*(.*)$/u);
    if (!field) continue;
    const [, rawKey, value] = field;
    const key = rawKey.trim();
    const current = result.get(currentId)!;
    current.protocolMetadata ??= {};
    switch (key) {
      case 'representation':
        if (isRepresentation(value)) current.representation = value as PublicChangeRepresentation;
        break;
      case 'actionability':
        if (isActionabilityState(value)) current.actionability = { ...(current.actionability ?? {}), state: value as PublicActionabilityState };
        break;
      case 'reason':
        current.actionability = { state: current.actionability?.state ?? 'blocked', reason: value };
        break;
      case 'anchor': {
        const [kind, ...markerParts] = value.split(':');
        const maybeRole = markerParts[markerParts.length - 1];
        const childRole = isAnchorChildRole(maybeRole) ? maybeRole : undefined;
        const marker = (childRole ? markerParts.slice(0, -1) : markerParts).join(':');
        if (isAnchorKind(kind) && marker) {
          current.anchors ??= [];
          current.anchors.push({
            kind: kind as PublicAnchorKind,
            marker,
            ...(childRole ? { childRole } : {}),
          });
        }
        break;
      }
      case 'parent':
        current.parentId = value as ChangeId;
        break;
      case 'children':
        current.children = value.split(/\s+/u).filter(Boolean) as ChangeId[];
        break;
      default:
        current.protocolMetadata[key] = value;
        break;
    }
  }
  return result;
}

function defaultAnchorForChange(id: ChangeId, change: ChangeNode | undefined, body: string): { kind: 'inline-range'; marker: string } {
  const footnoteMarker = `[^${id}]`;
  if (body.includes(footnoteMarker)) return { kind: 'inline-range', marker: footnoteMarker };
  if (change && change.range.start >= 0 && change.range.end > change.range.start) {
    const marker = body.slice(change.range.start, change.range.end);
    if (marker.length > 0) return { kind: 'inline-range', marker };
  }
  return { kind: 'inline-range', marker: footnoteMarker };
}

function publicKindFromChangeType(type: ChangeType): PublicChangeKind {
  switch (type) {
    case ChangeType.Insertion: return 'ins';
    case ChangeType.Deletion: return 'del';
    case ChangeType.Substitution: return 'sub';
    case ChangeType.Move: return 'move';
    case ChangeType.Comment: return 'comment';
    default: return 'metadata';
  }
}

function publicStatusForChange(change: ChangeNode | undefined): PublicChangeStatus {
  const status = change?.metadata?.status ?? change?.inlineMetadata?.status ?? change?.status;
  return publicStatusFromChangeStatus(status);
}

function publicStatusFromChangeStatus(status: string | ChangeStatus | undefined): PublicChangeStatus {
  const normalized = String(status ?? 'proposed').toLowerCase();
  if (isPublicStatus(normalized)) return normalized as PublicChangeStatus;
  return 'proposed';
}

function isPublicKind(value: string): boolean {
  return ['ins', 'del', 'sub', 'format', 'move', 'comment', 'metadata'].includes(value);
}

function isPublicStatus(value: string): boolean {
  return ['proposed', 'accepted', 'rejected', 'resolved', 'unresolved', 'diagnostic', 'conflict'].includes(value);
}

function isRepresentation(value: string): boolean {
  return ['inline-markup', 'rendered-substitution', 'metadata-anchor', 'compound-parent', 'compound-child', 'comment-thread'].includes(value);
}

function isActionabilityState(value: string): boolean {
  return ['protocol-ready', 'action-plan-ready', 'native-ready', 'thread-ready', 'blocked', 'diagnostic-only', 'conflict'].includes(value);
}

function isAnchorKind(value: string): boolean {
  return ['inline-range', 'paragraph', 'block', 'metadata', 'compound-child'].includes(value);
}

function isAnchorChildRole(value: string | undefined): value is 'move-from' | 'move-to' | 'comment-range' | 'metadata-target' {
  return value !== undefined && ['move-from', 'move-to', 'comment-range', 'metadata-target'].includes(value);
}
