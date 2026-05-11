import type { OoxmlPackageSnapshot } from "./index.js";

export type CapabilityAvailability =
  | "available"
  | "unavailable"
  | "unknown";

export type OoxmlRevisionWitnessKind =
  | "insert"
  | "delete"
  | "move-from"
  | "move-to"
  | "run-property-change"
  | "paragraph-property-change"
  | "table-property-change"
  | "row-property-change"
  | "cell-property-change";

export type OoxmlRevisionContainerKind =
  | "content-control"
  | "field"
  | "bookmark-range"
  | "comment-range"
  | "move-range"
  | "math"
  | "drawing"
  | "table"
  | "table-cell"
  | "permission-range"
  | "unknown-protected";

export interface OoxmlRevisionContainerContext {
  kind: OoxmlRevisionContainerKind;
  path?: string;
  xmlStart?: number;
  xmlEnd?: number;
  reason?: string;
}

export interface OoxmlRevisionSourceCapability {
  visibleInCurrentProjection: boolean;
  emitsChangeDownRecord: boolean;
  patchableByPackageTransition: CapabilityAvailability;
  readOnlyReasons: readonly string[];
}

export interface OoxmlRevisionWitness {
  id: string;
  kind: OoxmlRevisionWitnessKind;
  nativeRevisionTag: string;
  nativeRevisionId?: string;
  partName: string;
  path: string;
  xmlStart?: number;
  xmlEnd?: number;
  author?: string;
  date?: string;
  textPreview: string;
  textHash: string;
  containerContext: readonly OoxmlRevisionContainerContext[];
  sourceCapability: OoxmlRevisionSourceCapability;
}

interface TagToken {
  name: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
  raw: string;
  attrs: Readonly<Record<string, string>>;
}

interface StackFrame {
  name: string;
  path: string;
  start: number;
  childCounts: Map<string, number>;
  context?: OoxmlRevisionContainerContext;
}

const REVISION_TAGS: Readonly<Record<string, OoxmlRevisionWitnessKind>> = {
  ins: "insert",
  del: "delete",
  moveFrom: "move-from",
  moveTo: "move-to",
  rPrChange: "run-property-change",
  pPrChange: "paragraph-property-change",
  tblPrChange: "table-property-change",
  trPrChange: "row-property-change",
  tcPrChange: "cell-property-change",
};

const CONTAINER_CONTEXTS: Readonly<
  Record<string, OoxmlRevisionContainerKind>
> = {
  sdt: "content-control",
  fldSimple: "field",
  hyperlink: "unknown-protected",
  oMath: "math",
  oMathPara: "math",
  drawing: "drawing",
  pict: "drawing",
  tbl: "table",
  tc: "table-cell",
  moveFrom: "move-range",
  moveTo: "move-range",
};

export function collectOoxmlRevisionWitnesses(
  snapshot: OoxmlPackageSnapshot,
  partName = snapshot.documentPartName
): OoxmlRevisionWitness[] {
  const part = snapshot.parts.get(partName);
  if (!part?.text) return [];

  const xml = part.text;
  const tokens = scanTags(xml);
  const root: StackFrame = {
    name: "",
    path: "",
    start: 0,
    childCounts: new Map(),
  };
  const stack: StackFrame[] = [root];
  const witnesses: OoxmlRevisionWitness[] = [];

  for (const token of tokens) {
    if (token.closing) {
      while (stack.length > 1) {
        const popped = stack.pop();
        if (popped?.name === token.name) break;
      }
      continue;
    }

    const parent = stack[stack.length - 1] ?? root;
    const nextIndex = (parent.childCounts.get(token.name) ?? 0) + 1;
    parent.childCounts.set(token.name, nextIndex);
    const path = `${parent.path}/${prefixedName(token.name)}[${nextIndex}]`;
    const context = contextForToken(token, path);
    const frame: StackFrame = {
      name: token.name,
      path,
      start: token.start,
      childCounts: new Map(),
      ...(context ? { context } : {}),
    };

    const witnessKind = REVISION_TAGS[token.name];
    if (witnessKind) {
      const xmlEnd = findElementEnd(xml, token);
      const revisionXml = xml.slice(token.start, xmlEnd);
      const containerContext = stack
        .map((entry) => entry.context)
        .filter((entry): entry is OoxmlRevisionContainerContext =>
          Boolean(entry)
        );
      witnesses.push(
        buildWitness({
          kind: witnessKind,
          nativeRevisionTag: token.name,
          token,
          partName,
          path,
          xmlEnd,
          revisionXml,
          containerContext,
          hasFullPackage: snapshot.capabilities.hasFullPackage,
        })
      );
    }

    if (!token.selfClosing) {
      stack.push(frame);
    }
  }

  return witnesses;
}

function buildWitness(input: {
  kind: OoxmlRevisionWitnessKind;
  nativeRevisionTag: string;
  token: TagToken;
  partName: string;
  path: string;
  xmlEnd: number;
  revisionXml: string;
  containerContext: readonly OoxmlRevisionContainerContext[];
  hasFullPackage: boolean;
}): OoxmlRevisionWitness {
  const readOnlyReasons = readOnlyReasonsFor(
    input.containerContext,
    input.kind
  );
  const textPreview = textFromRevisionXml(input.revisionXml).slice(0, 240);
  const nativeRevisionId = input.token.attrs.id;
  const id = stableWitnessId({
    partName: input.partName,
    tag: input.nativeRevisionTag,
    nativeRevisionId,
    path: input.path,
    xmlStart: input.token.start,
    xmlEnd: input.xmlEnd,
  });
  const emitsChangeDownRecord = readOnlyReasons.length === 0;
  const visibleBareInsertion =
    input.kind === "insert" && readOnlyReasons.length === 0;

  return {
    id,
    kind: input.kind,
    nativeRevisionTag: input.nativeRevisionTag,
    ...(nativeRevisionId ? { nativeRevisionId } : {}),
    partName: input.partName,
    path: input.path,
    xmlStart: input.token.start,
    xmlEnd: input.xmlEnd,
    author: input.token.attrs.author,
    date: input.token.attrs.date,
    textPreview,
    textHash: stableTextHash(textPreview),
    containerContext: input.containerContext,
    sourceCapability: {
      visibleInCurrentProjection: visibleBareInsertion,
      emitsChangeDownRecord,
      patchableByPackageTransition:
        readOnlyReasons.length > 0 ? "unavailable" : "unknown",
      readOnlyReasons,
    },
  };
}

function scanTags(xml: string): TagToken[] {
  const tokens: TagToken[] = [];
  const pattern =
    /<(?<slash>\/)?(?:(?<prefix>[A-Za-z0-9_]+):)?(?<name>[A-Za-z_][A-Za-z0-9_.-]*)\b(?<attrs>[^>]*)>/gs;
  for (const match of xml.matchAll(pattern)) {
    const raw = match[0] ?? "";
    if (raw.startsWith("<?") || raw.startsWith("<!")) continue;
    const name = match.groups?.name;
    if (!name) continue;
    tokens.push({
      name,
      start: match.index ?? 0,
      end: (match.index ?? 0) + raw.length,
      closing: Boolean(match.groups?.slash),
      selfClosing: /\/\s*>$/.test(raw),
      raw,
      attrs: parseAttributes(match.groups?.attrs ?? ""),
    });
  }
  return tokens;
}

function parseAttributes(rawAttrs: string): Readonly<Record<string, string>> {
  const attrs: Record<string, string> = {};
  const pattern =
    /(?:(?:[A-Za-z0-9_]+):)?([A-Za-z_][A-Za-z0-9_.-]*)="([^"]*)"/g;
  for (const match of rawAttrs.matchAll(pattern)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined && attrs[key] === undefined) {
      attrs[key] = decodeXmlText(value);
    }
  }
  return attrs;
}

function contextForToken(
  token: TagToken,
  path: string
): OoxmlRevisionContainerContext | undefined {
  const kind = CONTAINER_CONTEXTS[token.name];
  if (!kind) return undefined;
  return {
    kind,
    path,
    xmlStart: token.start,
    xmlEnd: token.end,
  };
}

function readOnlyReasonsFor(
  contexts: readonly OoxmlRevisionContainerContext[],
  kind: OoxmlRevisionWitnessKind
): string[] {
  const reasons = new Set<string>();
  if (kind.endsWith("property-change")) reasons.add("formatting-revision");
  if (kind === "move-from" || kind === "move-to") reasons.add("move-range");
  for (const context of contexts) {
    if (context.kind === "content-control") reasons.add("content-control");
    if (context.kind === "field") reasons.add("field");
    if (context.kind === "math") reasons.add("math");
    if (context.kind === "drawing") reasons.add("drawing");
    if (context.kind === "move-range") reasons.add("move-range");
    if (context.kind === "permission-range") reasons.add("permission-range");
    if (context.kind === "unknown-protected") {
      reasons.add("unknown-protected");
    }
  }
  return [...reasons];
}

function findElementEnd(xml: string, token: TagToken): number {
  if (token.selfClosing) return token.end;
  const localClosePattern = new RegExp(
    `</(?:[A-Za-z0-9_]+:)?${escapeRegExp(token.name)}\\s*>`,
    "g"
  );
  localClosePattern.lastIndex = token.end;
  const match = localClosePattern.exec(xml);
  return match ? match.index + match[0].length : token.end;
}

function textFromRevisionXml(xml: string): string {
  return decodeXmlText(
    [
      ...xml.matchAll(
        /<(?:[A-Za-z0-9_]+:)?(?:t|delText)\b[^>]*>(.*?)<\/(?:[A-Za-z0-9_]+:)?(?:t|delText)>/gs
      ),
    ]
      .map((match) => match[1] ?? "")
      .join("")
      .replace(/<[^>]+>/g, "")
  );
}

function stableWitnessId(input: {
  partName: string;
  tag: string;
  nativeRevisionId: string | undefined;
  path: string;
  xmlStart: number;
  xmlEnd: number;
}): string {
  const nativeId =
    input.nativeRevisionId ?? `no-wid:${input.xmlStart}-${input.xmlEnd}`;
  return `ooxml:${input.partName}:${input.tag}:${nativeId}:${input.path}`;
}

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function prefixedName(localName: string): string {
  return `w:${localName}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
