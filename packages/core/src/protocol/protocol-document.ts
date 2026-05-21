import type { ChangeDownProtocolDocument, ProtocolInvariantResult, PublicChangeEntry } from './types.js';

export interface BuildChangeDownProtocolDocumentInput {
  backendKind?: ChangeDownProtocolDocument['backendKind'];
  body: string;
  entries: readonly PublicChangeEntry[];
  validate?: boolean;
}

export function buildChangeDownProtocolDocument(input: BuildChangeDownProtocolDocumentInput): ChangeDownProtocolDocument {
  const footnotes = input.entries.map(renderPublicEntryFootnote).join('\n\n');
  const source = footnotes.length > 0 ? `${input.body}\n\n${footnotes}\n` : `${input.body}\n`;
  const protocol: ChangeDownProtocolDocument = {
    backendKind: input.backendKind ?? 'word-ooxml',
    source,
    body: input.body,
    entries: input.entries.slice(),
    digest: digestProtocolSource(source),
  };
  if (input.validate !== false) {
    const invariant = assertProtocolDocumentInvariants(protocol);
    if (!invariant.ok) throw new Error(`ProtocolInvariantViolation: ${invariant.errors.join('; ')}`);
  }
  return protocol;
}

export function renderPublicEntryFootnote(entry: PublicChangeEntry): string {
  const headerParts = [entry.author ?? '@word'];
  if (entry.date) headerParts.push(entry.date.slice(0, 10));
  headerParts.push(entry.kind, entry.status);
  const lines = [`[^${entry.id}]: ${headerParts.join(' | ')}`];
  lines.push(`    representation: ${entry.representation}`);
  lines.push(`    actionability: ${entry.actionability.state}`);
  if (entry.actionability.reason) lines.push(`    reason: ${entry.actionability.reason}`);
  for (const anchor of entry.anchors) {
    lines.push(`    anchor: ${anchor.kind}:${anchor.marker}${anchor.childRole ? `:${anchor.childRole}` : ''}`);
  }
  if (entry.parentId) lines.push(`    parent: ${entry.parentId}`);
  if (entry.children?.length) lines.push(`    children: ${entry.children.join(' ')}`);
  for (const [key, value] of Object.entries(entry.protocolMetadata)) {
    lines.push(`    ${key}: ${value}`);
  }
  return lines.join('\n');
}

export function assertProtocolDocumentInvariants(protocol: ChangeDownProtocolDocument): ProtocolInvariantResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const entry of protocol.entries) {
    if (seen.has(entry.id)) errors.push(`duplicate-entry:${entry.id}`);
    seen.add(entry.id);
    if (entry.anchors.length === 0) errors.push(`no-anchors:${entry.id}`);
    for (const anchor of entry.anchors) {
      if (!protocol.body.includes(anchor.marker)) {
        errors.push(`missing-anchor:${entry.id}:${anchor.marker}`);
      }
    }
    if (entry.parentId && !protocol.entries.some((candidate) => candidate.id === entry.parentId)) {
      errors.push(`missing-parent:${entry.id}:${entry.parentId}`);
    }
    for (const child of entry.children ?? []) {
      if (!protocol.entries.some((candidate) => candidate.id === child)) errors.push(`missing-child:${entry.id}:${child}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function digestProtocolSource(source: string): string {
  return `fnv1a64:${fnv1a64Hex(source)}`;
}

function fnv1a64Hex(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
