import { XMLParser } from "fast-xml-parser";
import type {
  OoxmlEvent,
  OoxmlPackageSnapshot,
  OoxmlRunStyle,
  OoxmlStreamOptions,
  ProtectedOoxmlReason,
  RelationshipTable,
} from "./index.js";

interface OrderedChild {
  tag: string;
  children: unknown[];
  attrs: Record<string, string>;
}

interface StreamState {
  readonly partName: string;
  readonly relationships?: RelationshipTable;
  pathStack: string[];
  pathCounts: Map<string, number>;
  plainOffset: number;
  activeRunStyle: OoxmlRunStyle;
  activeHyperlinkRelationshipId?: string;
  activeFieldDepth: number;
  revisionsMode: NonNullable<OoxmlStreamOptions["revisions"]>;
  namespaces: ReadonlyMap<string, string>;
}

const ORDERED_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const PROTECTED_REASON_BY_TAG: Readonly<
  Record<string, ProtectedOoxmlReason | undefined>
> = {
  "w:drawing": "drawing",
  "w:pict": "drawing",
  "w:footnoteReference": "footnote-reference",
  "w:endnoteReference": "endnote-reference",
  "w:commentRangeStart": "comment-range",
  "w:commentRangeEnd": "comment-range",
  "w:fldChar": "field",
  "w:instrText": "field",
  "w:fldSimple": "field",
  "w:bookmarkStart": "bookmark",
  "w:bookmarkEnd": "bookmark",
  "w:sdt": "content-control",
  "w:moveFrom": "move-range",
  "w:moveTo": "move-range",
  "w:moveFromRangeStart": "move-range",
  "w:moveFromRangeEnd": "move-range",
  "w:moveToRangeStart": "move-range",
  "w:moveToRangeEnd": "move-range",
  "w:ins": "existing-revision",
  "w:del": "existing-revision",
  "m:oMath": "math",
  "m:oMathPara": "math",
};

const WORDPROCESSINGML_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const OMML_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/math";
const OOXML_RELATIONSHIPS_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export function streamOoxmlPartEvents(
  snapshot: OoxmlPackageSnapshot,
  partName = snapshot.documentPartName,
  options: OoxmlStreamOptions = {}
): OoxmlEvent[] {
  const part = snapshot.parts.get(partName);
  if (!part?.text) {
    throw new Error(`Cannot stream OOXML part without text: ${partName}`);
  }

  const parsed = ORDERED_PARSER.parse(part.text);
  const events: OoxmlEvent[] = [{ kind: "partStart", partName }];
  const state: StreamState = {
    partName,
    relationships: snapshot.relationships.byPart.get(partName),
    pathStack: [],
    pathCounts: new Map(),
    plainOffset: 0,
    activeRunStyle: {},
    activeFieldDepth: 0,
    revisionsMode: options.revisions ?? "protected",
    namespaces: new Map(),
  };

  walkChildren(getOrderedChildren(parsed), state, events);
  events.push({ kind: "partEnd", partName });
  annotateSourceRanges(events, part.text);
  return events;
}

function walkChildren(
  children: readonly OrderedChild[],
  state: StreamState,
  events: OoxmlEvent[]
): void {
  for (const child of children) {
    walkChild(child, state, events);
  }
}

function walkChild(
  child: OrderedChild,
  state: StreamState,
  events: OoxmlEvent[]
): void {
  const path = enterPath(child.tag, state);
  const previousNamespaces = state.namespaces;
  state.namespaces = namespacesWithDeclarations(previousNamespaces, child.attrs);
  const fieldTransitions = getFieldTransitions(child);
  const protectedReason = getProtectedReason(child, state, fieldTransitions);
  const revisionType = getSemanticRevisionType(child, state);

  if (protectedReason) {
    const protectedXml = serializeOrderedChildWithNamespaceContext(
      child,
      previousNamespaces
    );
    events.push({
      kind: "protected",
      partName: state.partName,
      path,
      xml: protectedXml,
      reason: protectedReason,
      relationshipIds: getRelationshipIdsInXml(protectedXml),
    });
    applyFieldTransitions(fieldTransitions, state);
    state.namespaces = previousNamespaces;
    exitPath(state);
    return;
  }

  if (revisionType) {
    events.push({
      kind: "revisionStart",
      partName: state.partName,
      path,
      type: revisionType,
      // Preserve the qualified OOXML tag here; the Word add-in normalizes to
      // local names at the native-join boundary.
      nativeRevisionTag: child.tag,
      nativeRevisionId: attrByLocalName(child.attrs, "id"),
      author: attrByLocalName(child.attrs, "author"),
      date: attrByLocalName(child.attrs, "date"),
      xml: serializeOrderedChild(child),
    });
  }

  events.push({
    kind: "elementStart",
    partName: state.partName,
    path,
    name: child.tag,
    attrs: child.attrs,
    xml: serializeOrderedChild(child),
  });

  const previousStyle = state.activeRunStyle;
  const previousHyperlinkRelationshipId = state.activeHyperlinkRelationshipId;

  if (child.tag === "w:r") {
    state.activeRunStyle = {
      ...state.activeRunStyle,
      ...parseRunStyle(child.children),
    };
  }

  if (child.tag === "w:hyperlink") {
    state.activeHyperlinkRelationshipId = child.attrs["r:id"];
  }

  if (isTextTag(child.tag)) {
    emitTextEvent(child, path, state, events);
  } else if (isVisibleTextControlTag(child.tag)) {
    emitTextEvent(
      child,
      path,
      state,
      events,
      visibleTextControlText(child.tag)
    );
  } else {
    walkChildren(getOrderedChildren(child.children), state, events);
  }

  if (child.tag === "w:r") {
    state.activeRunStyle = previousStyle;
  }

  if (child.tag === "w:hyperlink") {
    state.activeHyperlinkRelationshipId = previousHyperlinkRelationshipId;
  }

  events.push({
    kind: "elementEnd",
    partName: state.partName,
    path,
    name: child.tag,
  });

  if (revisionType) {
    events.push({
      kind: "revisionEnd",
      partName: state.partName,
      path,
      type: revisionType,
    });
  }
  state.namespaces = previousNamespaces;
  exitPath(state);
}

function emitTextEvent(
  child: OrderedChild,
  path: string,
  state: StreamState,
  events: OoxmlEvent[],
  textOverride?: string
): void {
  const text = textOverride ?? collectText(child.children);
  const plainStart = state.plainOffset;
  const plainEnd = plainStart + text.length;
  state.plainOffset = plainEnd;

  events.push({
    kind: "text",
    partName: state.partName,
    path,
    xml: serializeOrderedChild(child),
    text,
    runStyle: {
      ...state.activeRunStyle,
      ...(state.activeHyperlinkRelationshipId
        ? { hyperlinkRelationshipId: state.activeHyperlinkRelationshipId }
        : undefined),
    },
    plainStart,
    plainEnd,
  });
}

function annotateSourceRanges(events: OoxmlEvent[], sourceXml: string): void {
  const lexicalRanges = scanLexicalRanges(sourceXml);
  for (const event of events) {
    if (
      event.kind !== "text" &&
      event.kind !== "protected" &&
      event.kind !== "elementStart" &&
      event.kind !== "revisionStart" &&
      event.kind !== "revisionEnd"
    ) {
      continue;
    }

    const range = lexicalRanges.get(event.path);
    if (!range) {
      continue;
    }

    event.xmlStart = range.xmlStart;
    event.xmlEnd = range.xmlEnd;
    if (event.kind !== "protected" && event.kind !== "revisionEnd") {
      event.xml = sourceXml.slice(range.xmlStart, range.xmlEnd);
    }

    if (event.kind === "text") {
      if (range.textStart !== undefined && range.textEnd !== undefined) {
        event.textStart = range.textStart;
        event.textEnd = range.textEnd;
      }
    }
  }
}

interface LexicalRange {
  xmlStart: number;
  xmlEnd: number;
  textStart?: number;
  textEnd?: number;
}

interface LexicalStackFrame {
  tag: string;
  path: string;
  tagPathSegment: string;
  xmlStart: number;
  contentStart: number;
}

function scanLexicalRanges(sourceXml: string): Map<string, LexicalRange> {
  const ranges = new Map<string, LexicalRange>();
  const stack: LexicalStackFrame[] = [];
  const pathCounts = new Map<string, number>();

  for (const tagRange of scanXmlTags(sourceXml)) {
    const rawTag = sourceXml.slice(tagRange.start, tagRange.end);
    if (
      rawTag.startsWith("<?") ||
      rawTag.startsWith("<!") ||
      rawTag.startsWith("<!--")
    ) {
      continue;
    }

    if (rawTag.startsWith("</")) {
      const closeName = /^<\/\s*([^\s>]+)\s*>$/.exec(rawTag)?.[1];
      const frame = stack.pop();
      if (!frame || (closeName && frame.tag !== closeName)) {
        continue;
      }
      const range: LexicalRange = { xmlStart: frame.xmlStart, xmlEnd: tagRange.end };
      if (isTextTag(frame.tag)) {
        range.textStart = frame.contentStart;
        range.textEnd = tagRange.start;
      }
      ranges.set(frame.path, range);
      continue;
    }

    const open = /^<\s*([^\s/>]+)[\s\S]*?(\/?)>$/.exec(rawTag);
    if (!open) {
      continue;
    }

    const tag = open[1];
    const selfClosing = isSelfClosingTag(rawTag);
    const parentPath = stack.map((frame) => `/${frame.tagPathSegment}`).join("");
    const siblingKey = `${parentPath}/${tag}`;
    const index = (pathCounts.get(siblingKey) ?? 0) + 1;
    pathCounts.set(siblingKey, index);
    const segment = `${tag}[${index}]`;
    const path = `${parentPath}/${segment}`;
    const contentStart = tagRange.end;

    if (selfClosing) {
      ranges.set(path, {
        xmlStart: tagRange.start,
        xmlEnd: contentStart,
        ...(isTextTag(tag)
          ? { textStart: contentStart, textEnd: contentStart }
          : undefined),
      });
    } else {
      stack.push({
        tag,
        path,
        tagPathSegment: segment,
        xmlStart: tagRange.start,
        contentStart,
      });
    }
  }

  return ranges;
}

function scanXmlTags(sourceXml: string): Array<{ start: number; end: number }> {
  const tags: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < sourceXml.length) {
    const start = sourceXml.indexOf("<", cursor);
    if (start < 0) {
      break;
    }
    let quote: '"' | "'" | undefined;
    let end = start + 1;
    for (; end < sourceXml.length; end += 1) {
      const char = sourceXml[end];
      if (quote) {
        if (char === quote) {
          quote = undefined;
        }
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === ">") {
        end += 1;
        break;
      }
    }
    if (end <= sourceXml.length && sourceXml[end - 1] === ">") {
      tags.push({ start, end });
    }
    cursor = Math.max(end, start + 1);
  }
  return tags;
}

function isSelfClosingTag(rawTag: string): boolean {
  for (let index = rawTag.length - 2; index >= 0; index -= 1) {
    const char = rawTag[index];
    if (/\s/.test(char ?? "")) {
      continue;
    }
    return char === "/";
  }
  return false;
}

function getProtectedReason(
  child: OrderedChild,
  state: StreamState,
  fieldTransitions: readonly FieldTransition[]
): ProtectedOoxmlReason | undefined {
  const expandedName = expandedElementName(child.tag, state.namespaces);
  const isWordTextRevision =
    expandedName?.namespaceUri === WORDPROCESSINGML_NS &&
    (expandedName.localName === "ins" || expandedName.localName === "del");
  if (
    state.revisionsMode === "semantic" &&
    isWordTextRevision
  ) {
    return undefined;
  }

  if (state.activeFieldDepth > 0 || fieldTransitions.length > 0) {
    return "field";
  }

  const explicitReason = PROTECTED_REASON_BY_TAG[child.tag];
  if (
    explicitReason &&
    !(
      state.revisionsMode === "semantic" &&
      isWordTextRevision
    )
  ) {
    return explicitReason;
  }
  if (
    isWordTextRevision &&
    state.revisionsMode !== "semantic"
  ) {
    return "existing-revision";
  }

  if (
    expandedName?.namespaceUri === WORDPROCESSINGML_NS &&
    (expandedName.localName === "drawing" || expandedName.localName === "pict")
  ) {
    return "drawing";
  }
  if (
    expandedName?.namespaceUri === OMML_NS &&
    (expandedName.localName === "oMath" || expandedName.localName === "oMathPara")
  ) {
    return "math";
  }

  for (const relationshipId of getRelationshipIds(child.attrs)) {
    if (!state.relationships?.relationships.has(relationshipId)) {
      return "unknown-relationship";
    }
  }

  return undefined;
}

function getSemanticRevisionType(
  child: OrderedChild,
  state: StreamState
): "ins" | "del" | undefined {
  if (state.revisionsMode !== "semantic") {
    return undefined;
  }
  const expandedName = expandedElementName(child.tag, state.namespaces);
  if (
    expandedName?.namespaceUri === WORDPROCESSINGML_NS &&
    expandedName.localName === "ins"
  ) {
    return "ins";
  }
  if (
    expandedName?.namespaceUri === WORDPROCESSINGML_NS &&
    expandedName.localName === "del"
  ) {
    return "del";
  }
  return undefined;
}

function expandedElementName(
  tag: string,
  namespaces: ReadonlyMap<string, string>
): { namespaceUri: string; localName: string } | undefined {
  const [prefix, localName] = tag.split(":", 2);
  if (!prefix || !localName) {
    return undefined;
  }
  const namespaceUri = namespaces.get(prefix);
  return namespaceUri ? { namespaceUri, localName } : undefined;
}

function attrByLocalName(
  attrs: Readonly<Record<string, string>>,
  localName: string
): string | undefined {
  return attrs[localName] ?? Object.entries(attrs).find(([key]) =>
    key.endsWith(`:${localName}`)
  )?.[1];
}

function parseRunStyle(children: readonly unknown[]): OoxmlRunStyle {
  const rPr = getOrderedChildren(children).find(
    (child) => child.tag === "w:rPr"
  );
  if (!rPr) {
    return {};
  }

  const rPrChildren = getOrderedChildren(rPr.children);
  return {
    ...(runPropertyEnabled(rPrChildren, "w:b") ? { bold: true } : undefined),
    ...(runPropertyEnabled(rPrChildren, "w:i") ? { italic: true } : undefined),
    ...(runPropertyEnabled(rPrChildren, "w:strike") ||
    runPropertyEnabled(rPrChildren, "w:dstrike")
      ? { strikethrough: true }
      : undefined),
    ...(runPropertyEnabled(rPrChildren, "w:u")
      ? { underline: true }
      : undefined),
    ...(runStyleCodeEnabled(rPrChildren) ? { code: true } : undefined),
  };
}

function runPropertyEnabled(
  rPrChildren: readonly OrderedChild[],
  tag: string
): boolean {
  const property = rPrChildren.find((child) => child.tag === tag);
  if (!property) {
    return false;
  }

  const value = property.attrs["w:val"] ?? property.attrs.val;
  return value === undefined || !["false", "0", "off", "none"].includes(value);
}

function runStyleCodeEnabled(rPrChildren: readonly OrderedChild[]): boolean {
  const runStyle = rPrChildren.find((child) => child.tag === "w:rStyle");
  const value = runStyle?.attrs["w:val"] ?? runStyle?.attrs.val;
  return value === "Code" || value === "code";
}

function getOrderedChildren(container: unknown): OrderedChild[] {
  if (!Array.isArray(container)) {
    return [];
  }

  const result: OrderedChild[] = [];
  for (const entry of container) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as Record<string, unknown>;
    const tag = Object.keys(record).find(
      (key) => key !== ":@" && key !== "#text"
    );
    if (!tag) {
      continue;
    }

    result.push({
      tag,
      children: Array.isArray(record[tag]) ? record[tag] : [],
      attrs: normalizeAttributes(record[":@"]),
    });
  }
  return result;
}

function collectText(children: readonly unknown[]): string {
  return children
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const text = (entry as Record<string, unknown>)["#text"];
      return typeof text === "string" || typeof text === "number"
        ? String(text)
        : "";
    })
    .join("");
}

function normalizeAttributes(attrs: unknown): Record<string, string> {
  if (!attrs || typeof attrs !== "object") {
    return {};
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
    normalized[key.startsWith("@_") ? key.slice(2) : key] = String(value);
  }
  return normalized;
}

function enterPath(tag: string, state: StreamState): string {
  const parentPath = state.pathStack.join("");
  const siblingKey = `${parentPath}/${tag}`;
  const index = (state.pathCounts.get(siblingKey) ?? 0) + 1;
  state.pathCounts.set(siblingKey, index);

  state.pathStack.push(`/${tag}[${index}]`);
  return state.pathStack.join("");
}

function exitPath(state: StreamState): void {
  state.pathStack.pop();
}

function isTextTag(tag: string): boolean {
  return tag === "w:t" || tag === "w:delText";
}

function isVisibleTextControlTag(tag: string): boolean {
  return tag === "w:tab" || tag === "w:br";
}

function visibleTextControlText(tag: string): string {
  return tag === "w:tab" ? "\t" : "\n";
}

type FieldTransition = "begin" | "separate" | "end";

function getFieldTransitions(child: OrderedChild): FieldTransition[] {
  if (child.tag !== "w:fldChar" && child.tag !== "w:r") {
    return [];
  }

  const transitions: FieldTransition[] = [];
  collectFieldTransitions(child, transitions);
  return transitions;
}

function collectFieldTransitions(
  child: OrderedChild,
  transitions: FieldTransition[]
): void {
  if (child.tag === "w:fldChar") {
    const fieldCharType =
      child.attrs["w:fldCharType"] ?? child.attrs.fldCharType;
    if (
      fieldCharType === "begin" ||
      fieldCharType === "separate" ||
      fieldCharType === "end"
    ) {
      transitions.push(fieldCharType);
    }
  }

  for (const descendant of getOrderedChildren(child.children)) {
    collectFieldTransitions(descendant, transitions);
  }
}

function applyFieldTransitions(
  transitions: readonly FieldTransition[],
  state: StreamState
): void {
  for (const transition of transitions) {
    if (transition === "begin") {
      state.activeFieldDepth += 1;
    } else if (transition === "end") {
      state.activeFieldDepth = Math.max(0, state.activeFieldDepth - 1);
    }
  }
}

function getRelationshipIds(attrs: Record<string, string>): string[] {
  return Object.entries(attrs)
    .filter(([key]) => key === "r:id" || key === "r:embed" || key === "r:link")
    .map(([, value]) => value);
}

function getRelationshipIdsInXml(xml: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const relationshipPrefixes = namespacePrefixes(xml, OOXML_RELATIONSHIPS_NS);
  const hasExplicitR = namespacePrefixDeclared(xml, "r");
  for (const match of xml.matchAll(
    /\b([A-Za-z_][\w.-]*):(id|embed|link)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  )) {
    const prefix = match[1];
    const isRelationshipPrefix = relationshipPrefixes.has(prefix);
    const isUndeclaredRFallback = prefix === "r" && !hasExplicitR;
    if (!isRelationshipPrefix && !isUndeclaredRFallback) {
      continue;
    }
    const id = match[3] ?? match[4] ?? "";
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function namespacePrefixes(xml: string, namespaceUri: string): Set<string> {
  const prefixes = new Set<string>();
  for (const match of xml.matchAll(
    /\bxmlns:([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  )) {
    if ((match[2] ?? match[3] ?? "") === namespaceUri) {
      prefixes.add(match[1]);
    }
  }
  return prefixes;
}

function namespacePrefixDeclared(xml: string, prefix: string): boolean {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bxmlns:${escapedPrefix}\\s*=`).test(xml);
}

function namespacesWithDeclarations(
  inherited: ReadonlyMap<string, string>,
  attrs: Record<string, string>
): ReadonlyMap<string, string> {
  const next = new Map(inherited);
  for (const [name, value] of Object.entries(attrs)) {
    if (!name.startsWith("xmlns:")) {
      continue;
    }
    next.set(name.slice("xmlns:".length), value);
  }
  return next;
}

function serializeOrderedChildWithNamespaceContext(
  child: OrderedChild,
  inheritedNamespaces: ReadonlyMap<string, string>
): string {
  const attrs = { ...child.attrs };
  for (const [prefix, namespaceUri] of inheritedNamespaces.entries()) {
    const attrName = `xmlns:${prefix}`;
    if (attrs[attrName] === undefined) {
      attrs[attrName] = namespaceUri;
    }
  }
  return serializeOrderedChild({ ...child, attrs });
}

function serializeOrderedChild(child: OrderedChild): string {
  const attrs = Object.entries(child.attrs)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join("");
  if (child.children.length === 0) {
    return `<${child.tag}${attrs}/>`;
  }

  const children = child.children
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const text = (entry as Record<string, unknown>)["#text"];
      if (typeof text === "string" || typeof text === "number") {
        return escapeXml(String(text));
      }
      return getOrderedChildren([entry]).map(serializeOrderedChild).join("");
    })
    .join("");

  return `<${child.tag}${attrs}>${children}</${child.tag}>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}
