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
  propertySummary?: string;
  textHash: string;
  containerContext: readonly OoxmlRevisionContainerContext[];
  sourceCapability: OoxmlRevisionSourceCapability;
}

export interface CollectOoxmlRevisionWitnessesAsyncOptions {
  yieldToHost?: () => Promise<void>;
  scanChunkSize?: number;
  trace?: (detail: Record<string, unknown>) => void;
  /**
   * Emits per-witness start/done trace records around the expensive witness
   * assembly operations. Intended for live-lab diagnostics; callers should keep
   * this disabled for ordinary projection traces to avoid crowding the trace
   * buffer.
   */
  traceWitnessDetails?: boolean;
}

interface TagToken {
  prefix?: string;
  name: string;
  tagKey: string;
  namespaceUri?: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
  raw: string;
  attrs: Readonly<Record<string, string>>;
}

interface StackFrame {
  tagKey: string;
  path: string;
  start: number;
  namespaces: Readonly<Record<string, string>>;
  childCounts: Map<string, number>;
  context?: OoxmlRevisionContainerContext;
}

const WORDPROCESSINGML_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

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
  return collectWitnessesFromTokens(snapshot, partName, xml, tokens);
}

export async function collectOoxmlRevisionWitnessesAsync(
  snapshot: OoxmlPackageSnapshot,
  partName = snapshot.documentPartName,
  options: CollectOoxmlRevisionWitnessesAsyncOptions = {}
): Promise<OoxmlRevisionWitness[]> {
  const part = snapshot.parts.get(partName);
  if (!part?.text) return [];

  const yieldToHost = options.yieldToHost ?? (() => Promise.resolve());
  const scanChunkSize = options.scanChunkSize ?? 2_000;
  const xml = part.text;
  const tokens = await scanTagsAsync(xml, {
    yieldToHost,
    scanChunkSize,
    trace: options.trace,
  });
  options.trace?.({
    stage: "scan-done",
    partName,
    tokenCount: tokens.length,
  });
  return await collectWitnessesFromTokensAsync(
    snapshot,
    partName,
    xml,
    tokens,
    {
      yieldToHost,
      scanChunkSize,
      trace: options.trace,
      traceWitnessDetails: options.traceWitnessDetails === true,
    }
  );
}

function collectWitnessesFromTokens(
  snapshot: OoxmlPackageSnapshot,
  partName: string,
  xml: string,
  tokens: readonly TagToken[]
): OoxmlRevisionWitness[] {
  const root: StackFrame = {
    tagKey: "",
    path: "",
    start: 0,
    namespaces: {},
    childCounts: new Map(),
  };
  const stack: StackFrame[] = [root];
  const witnesses: OoxmlRevisionWitness[] = [];
  const elementEndByStart = mapElementEndsByStart(tokens);
  let activeFieldDepth = 0;

  for (const token of tokens) {
    if (token.closing) {
      while (stack.length > 1) {
        const popped = stack.pop();
        if (popped?.tagKey === token.tagKey) break;
      }
      continue;
    }

    const parent = stack[stack.length - 1] ?? root;
    const namespaces = namespacesForToken(parent.namespaces, token.raw);
    const resolvedToken: TagToken = {
      ...token,
      namespaceUri: resolveNamespace(token.prefix, namespaces),
    };
    const nextIndex = (parent.childCounts.get(resolvedToken.tagKey) ?? 0) + 1;
    parent.childCounts.set(resolvedToken.tagKey, nextIndex);
    const path = `${parent.path}/${displayName(resolvedToken)}[${nextIndex}]`;
    const context = contextForToken(resolvedToken, path);
    const fieldTransition = fieldTransitionForToken(resolvedToken);
    const frame: StackFrame = {
      tagKey: resolvedToken.tagKey,
      path,
      start: resolvedToken.start,
      namespaces,
      childCounts: new Map(),
      ...(context ? { context } : {}),
    };

    const witnessKind =
      resolvedToken.namespaceUri === WORDPROCESSINGML_NS
        ? REVISION_TAGS[resolvedToken.name]
        : undefined;
    if (witnessKind) {
      const xmlEnd =
        elementEndByStart.get(resolvedToken.start) ??
        findElementEnd(xml, resolvedToken);
      const revisionXml = xml.slice(resolvedToken.start, xmlEnd);
      const containerContext = [
        ...stack
          .map((entry) => entry.context)
          .filter((entry): entry is OoxmlRevisionContainerContext =>
            Boolean(entry)
          ),
        ...(activeFieldDepth > 0
          ? [{
              kind: "field" as const,
              reason: "complex-field",
            }]
          : []),
      ];
      witnesses.push(
        buildWitness({
          kind: witnessKind,
          // Preserve the qualified OOXML tag in the package-level witness; the
          // Word add-in normalizes to local names at the native-join boundary.
          nativeRevisionTag: displayName(resolvedToken),
          token: resolvedToken,
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
    if (fieldTransition === "begin") {
      activeFieldDepth += 1;
    } else if (fieldTransition === "end") {
      activeFieldDepth = Math.max(0, activeFieldDepth - 1);
    }
  }

  return witnesses;
}

async function collectWitnessesFromTokensAsync(
  snapshot: OoxmlPackageSnapshot,
  partName: string,
  xml: string,
  tokens: readonly TagToken[],
  options: Required<Pick<CollectOoxmlRevisionWitnessesAsyncOptions, "yieldToHost" | "scanChunkSize">> &
    Pick<CollectOoxmlRevisionWitnessesAsyncOptions, "trace" | "traceWitnessDetails">
): Promise<OoxmlRevisionWitness[]> {
  const root: StackFrame = {
    tagKey: "",
    path: "",
    start: 0,
    namespaces: {},
    childCounts: new Map(),
  };
  const stack: StackFrame[] = [root];
  const witnesses: OoxmlRevisionWitness[] = [];
  const elementEndByStart = mapElementEndsByStart(tokens);
  let activeFieldDepth = 0;
  let witnessBuildCount = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (index > 0 && index % options.scanChunkSize === 0) {
      options.trace?.({
        stage: "witness-build-progress",
        partName,
        tokenIndex: index,
        tokenCount: tokens.length,
        witnessCount: witnesses.length,
      });
      await options.yieldToHost();
    }

    if (token.closing) {
      while (stack.length > 1) {
        const popped = stack.pop();
        if (popped?.tagKey === token.tagKey) break;
      }
      continue;
    }

    const parent = stack[stack.length - 1] ?? root;
    const namespaces = namespacesForToken(parent.namespaces, token.raw);
    const resolvedToken: TagToken = {
      ...token,
      namespaceUri: resolveNamespace(token.prefix, namespaces),
    };
    const nextIndex = (parent.childCounts.get(resolvedToken.tagKey) ?? 0) + 1;
    parent.childCounts.set(resolvedToken.tagKey, nextIndex);
    const path = `${parent.path}/${displayName(resolvedToken)}[${nextIndex}]`;
    const context = contextForToken(resolvedToken, path);
    const fieldTransition = fieldTransitionForToken(resolvedToken);
    const frame: StackFrame = {
      tagKey: resolvedToken.tagKey,
      path,
      start: resolvedToken.start,
      namespaces,
      childCounts: new Map(),
      ...(context ? { context } : {}),
    };

    const witnessKind =
      resolvedToken.namespaceUri === WORDPROCESSINGML_NS
        ? REVISION_TAGS[resolvedToken.name]
        : undefined;
    if (witnessKind) {
      witnessBuildCount += 1;
      if (options.traceWitnessDetails) {
        options.trace?.({
          stage: "witness-build-started",
          partName,
          tokenIndex: index,
          tokenCount: tokens.length,
          witnessIndex: witnessBuildCount,
          witnessKind,
          ...(resolvedToken.attrs.id
            ? { nativeRevisionId: resolvedToken.attrs.id }
            : {}),
          xmlStart: resolvedToken.start,
        });
        await options.yieldToHost();
      }
      const xmlEnd =
        elementEndByStart.get(resolvedToken.start) ??
        findElementEnd(xml, resolvedToken);
      const revisionXml = xml.slice(resolvedToken.start, xmlEnd);
      const containerContext = [
        ...stack
          .map((entry) => entry.context)
          .filter((entry): entry is OoxmlRevisionContainerContext =>
            Boolean(entry)
          ),
        ...(activeFieldDepth > 0
          ? [{
              kind: "field" as const,
              reason: "complex-field",
            }]
          : []),
      ];
      const witness = buildWitness({
        kind: witnessKind,
        nativeRevisionTag: displayName(resolvedToken),
        token: resolvedToken,
        partName,
        path,
        xmlEnd,
        revisionXml,
        containerContext,
        hasFullPackage: snapshot.capabilities.hasFullPackage,
      });
      witnesses.push(witness);
      if (options.traceWitnessDetails) {
        options.trace?.({
          stage: "witness-build-one-done",
          partName,
          tokenIndex: index,
          tokenCount: tokens.length,
          witnessIndex: witnessBuildCount,
          witnessKind,
          witnessCount: witnesses.length,
          ...(resolvedToken.attrs.id
            ? { nativeRevisionId: resolvedToken.attrs.id }
            : {}),
          xmlStart: resolvedToken.start,
          xmlEnd,
          revisionXmlChars: revisionXml.length,
          textPreviewChars: witness.textPreview.length,
          propertySummaryChars: witness.propertySummary?.length ?? 0,
          readOnlyReasonCount:
            witness.sourceCapability.readOnlyReasons.length,
        });
        await options.yieldToHost();
      }
    }

    if (!token.selfClosing) {
      stack.push(frame);
    }
    if (fieldTransition === "begin") {
      activeFieldDepth += 1;
    } else if (fieldTransition === "end") {
      activeFieldDepth = Math.max(0, activeFieldDepth - 1);
    }
  }
  options.trace?.({
    stage: "witness-build-done",
    partName,
    tokenCount: tokens.length,
    witnessCount: witnesses.length,
  });
  await options.yieldToHost();
  return witnesses;
}

function mapElementEndsByStart(tokens: readonly TagToken[]): ReadonlyMap<number, number> {
  const byStart = new Map<number, number>();
  const stack: TagToken[] = [];
  for (const token of tokens) {
    if (token.closing) {
      while (stack.length > 0) {
        const opened = stack.pop()!;
        if (opened.tagKey === token.tagKey) {
          byStart.set(opened.start, token.end);
          break;
        }
      }
      continue;
    }
    if (token.selfClosing) {
      byStart.set(token.start, token.end);
      continue;
    }
    stack.push(token);
  }
  return byStart;
}

function fieldTransitionForToken(
  token: TagToken
): "begin" | "separate" | "end" | undefined {
  if (token.namespaceUri !== WORDPROCESSINGML_NS || token.name !== "fldChar") {
    return undefined;
  }
  const type = token.attrs.fldCharType;
  return type === "begin" || type === "separate" || type === "end"
    ? type
    : undefined;
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
  const propertySummary = propertySummaryFromRevisionXml(input.revisionXml);
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
    ...(propertySummary ? { propertySummary } : {}),
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
  let searchFrom = 0;
  while (searchFrom < xml.length) {
    const start = xml.indexOf("<", searchFrom);
    if (start === -1) break;
    const end = xml.indexOf(">", start + 1);
    if (end === -1) break;
    searchFrom = end + 1;
    const token = parseTagToken(xml, start, end + 1);
    if (token) tokens.push(token);
  }
  return tokens;
}

async function scanTagsAsync(
  xml: string,
  options: Required<Pick<CollectOoxmlRevisionWitnessesAsyncOptions, "yieldToHost" | "scanChunkSize">> &
    Pick<CollectOoxmlRevisionWitnessesAsyncOptions, "trace">
): Promise<TagToken[]> {
  const tokens: TagToken[] = [];
  let searchFrom = 0;
  while (searchFrom < xml.length) {
    const start = xml.indexOf("<", searchFrom);
    if (start === -1) break;
    const end = xml.indexOf(">", start + 1);
    if (end === -1) break;
    searchFrom = end + 1;
    const token = parseTagToken(xml, start, end + 1);
    if (!token) continue;
    tokens.push(token);
    if (tokens.length % options.scanChunkSize === 0) {
      options.trace?.({
        stage: "scan-progress",
        tokenCount: tokens.length,
        xmlIndex: start,
      });
      await options.yieldToHost();
    }
  }
  return tokens;
}

function parseTagToken(
  xml: string,
  start: number,
  end: number
): TagToken | undefined {
  const raw = xml.slice(start, end);
  if (raw.startsWith("<?") || raw.startsWith("<!")) return undefined;

  let cursor = 1;
  let closing = false;
  if (raw[cursor] === "/") {
    closing = true;
    cursor += 1;
  }

  while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
  const nameStart = cursor;
  while (/[A-Za-z0-9_.:-]/.test(raw[cursor] ?? "")) cursor += 1;
  if (cursor === nameStart) return undefined;
  const qualifiedName = raw.slice(nameStart, cursor);
  const localNameStart = qualifiedName.includes(":")
    ? qualifiedName.lastIndexOf(":") + 1
    : 0;
  const prefix =
    localNameStart > 0
      ? qualifiedName.slice(0, localNameStart - 1)
      : undefined;
  const name = qualifiedName.slice(localNameStart);
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(name)) return undefined;
  if (prefix && !/^[A-Za-z0-9_]+$/u.test(prefix)) return undefined;
  const attrs = raw.slice(cursor, raw.endsWith(">") ? -1 : undefined);

  return {
    ...(prefix ? { prefix } : {}),
    name,
    tagKey: prefix ? `${prefix}:${name}` : name,
    start,
    end,
    closing,
    selfClosing: /\/\s*>$/u.test(raw),
    raw,
    attrs: parseAttributes(attrs),
  };
}

function namespacesForToken(
  parentNamespaces: Readonly<Record<string, string>>,
  rawTag: string
): Readonly<Record<string, string>> {
  const namespaces: Record<string, string> = { ...parentNamespaces };
  for (const match of rawTag.matchAll(
    /\sxmlns(?::([A-Za-z0-9_.-]+))?=(?:"([^"]*)"|'([^']*)')/g
  )) {
    const prefix = match[1] ?? "";
    const uri = match[2] ?? match[3];
    if (uri !== undefined) namespaces[prefix] = decodeXmlText(uri);
  }
  return namespaces;
}

function resolveNamespace(
  prefix: string | undefined,
  namespaces: Readonly<Record<string, string>>
): string | undefined {
  return namespaces[prefix ?? ""];
}

function parseAttributes(rawAttrs: string): Readonly<Record<string, string>> {
  const attrs: Record<string, string> = {};
  const pattern =
    /(?:(?:[A-Za-z0-9_]+):)?([A-Za-z_][A-Za-z0-9_.-]*)=(?:"([^"]*)"|'([^']*)')/g;
  for (const match of rawAttrs.matchAll(pattern)) {
    const key = match[1];
    const value = match[2] ?? match[3];
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
  if (token.namespaceUri !== WORDPROCESSINGML_NS) return undefined;
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
  const tagPattern = new RegExp(
    `<(?<slash>/)?${escapeRegExp(token.tagKey)}\\b(?<attrs>[^>]*)>`,
    "g"
  );
  tagPattern.lastIndex = token.end;
  let depth = 1;
  for (let match = tagPattern.exec(xml); match; match = tagPattern.exec(xml)) {
    const raw = match[0] ?? "";
    if (match.groups?.slash) {
      depth -= 1;
      if (depth === 0) return (match.index ?? 0) + raw.length;
      continue;
    }
    if (!/\/\s*>$/.test(raw)) depth += 1;
  }
  return token.end;
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

function propertySummaryFromRevisionXml(xml: string): string | undefined {
  const names = new Set<string>();
  for (const match of xml.matchAll(
    /<(?<slash>\/)?(?:(?<prefix>[A-Za-z0-9_]+):)?(?<name>[A-Za-z_][A-Za-z0-9_.-]*)\b[^>]*>/g
  )) {
    if (match.groups?.slash) continue;
    const name = match.groups?.name;
    if (!name || REVISION_TAGS[name] !== undefined) continue;
    if (name === "r" || name === "p" || name === "t" || name === "delText") {
      continue;
    }
    names.add(name);
  }
  const summary = [...names].slice(0, 12).join(", ");
  return summary.length > 0 ? summary : undefined;
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

function displayName(token: TagToken): string {
  return token.prefix ? `${token.prefix}:${token.name}` : token.name;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
