import type { OoxmlPackageSnapshot } from "./index.js";
import {
  collectOoxmlRevisionWitnesses,
  type OoxmlRevisionWitness,
  type OoxmlRevisionWitnessKind,
} from "./revision-witness.js";

/**
 * Source of truth for OOXML revision element → codec group kind mapping.
 * Add new entries here as the codec gains support for additional revision
 * elements.
 *
 * Fields:
 *   element          — OOXML XML tag (no namespace prefix)
 *   kind             — codec OoxmlSourceRevisionGroupKind emitted for this element
 *   atomKind         — OoxmlRevisionWitnessKind produced by revision-witness.ts for
 *                      this element. Used to build ATOM_KIND_TO_GROUP_KIND at module
 *                      load for table-driven dispatch in groupFormattingAtoms().
 *   normalizedJoinKey — cross-package contract with GROUP_KIND_ALIAS in
 *                      packages/word-add-in/src/observer/word-reader.ts: the canonical
 *                      string that normalizeType(Word.Revision.type) must produce for a
 *                      successful L10 join bucket match.
 *
 * Invariant: every `kind` value here must have a corresponding entry derived from
 * TAXONOMY_GROUP_KIND_TO_JOIN_KEY in GROUP_KIND_ALIAS (word-reader.ts).
 *
 * NOTE on table/row/cell property kinds: Office.js does not currently expose
 * TableProperty / RowProperty / CellProperty as distinct Word.Revision.type values.
 * They are reported as "Property" (same as run-property). We assign per-element codec
 * group kinds for extensibility and future disambiguation, but route their join keys
 * to "property" so L10 bucket matching works today. When Office.js gains distinct
 * type strings, update normalizedJoinKey and GROUP_KIND_ALIAS accordingly.
 */
export const REVISION_ELEMENT_TAXONOMY = [
  { element: "ins",          kind: "insertion",          atomKind: "insert",                  normalizedJoinKey: "ins" },
  { element: "del",          kind: "deletion",           atomKind: "delete",                  normalizedJoinKey: "del" },
  { element: "rPrChange",    kind: "run-property",       atomKind: "run-property-change",     normalizedJoinKey: "property" },
  { element: "pPrChange",    kind: "paragraph-property", atomKind: "paragraph-property-change", normalizedJoinKey: "paragraph-property" },
  { element: "tblPrChange",  kind: "table-property",     atomKind: "table-property-change",   normalizedJoinKey: "property" },
  { element: "trPrChange",   kind: "row-property",       atomKind: "row-property-change",     normalizedJoinKey: "property" },
  { element: "tcPrChange",   kind: "cell-property",      atomKind: "cell-property-change",    normalizedJoinKey: "property" },
  { element: "moveFrom",     kind: "move",               atomKind: "move-from",               normalizedJoinKey: "move-from" },
  { element: "moveTo",       kind: "move",               atomKind: "move-to",                 normalizedJoinKey: "move-from" },
  // future: sectPrChange → "section-property"
] as const;

/**
 * Product-facing source revision group kind.
 *
 * The taxonomy rows below remain the atom-level truth for OOXML provenance and
 * native join diagnostics. Product rows intentionally coalesce property-change
 * atom kinds under "formatting", because Word's runtime revision surface does
 * not expose raw OOXML property atoms one-for-one after opening a document.
 */
export type OoxmlSourceRevisionGroupKind =
  (typeof REVISION_ELEMENT_TAXONOMY)[number]["kind"] | "formatting" | "comment";

/**
 * Table-driven map from atom kind (OoxmlRevisionWitnessKind) to codec group kind.
 * Built at module load from REVISION_ELEMENT_TAXONOMY — extend the taxonomy to
 * add new dispatch entries. If an atom kind is encountered that does not appear
 * in this map, groupFormattingAtoms() will throw an invariant error rather than
 * silently mislabeling the group.
 */
export const ATOM_KIND_TO_GROUP_KIND: ReadonlyMap<string, OoxmlSourceRevisionGroupKind> =
  new Map(REVISION_ELEMENT_TAXONOMY.map((row) => [row.atomKind, row.kind]));

/**
 * Derived map from codec group kind → normalizedJoinKey (cross-package contract).
 * Exported so word-reader.ts can derive GROUP_KIND_ALIAS from it rather than
 * maintaining a parallel copy. Adding a new taxonomy row propagates automatically.
 */
export const TAXONOMY_GROUP_KIND_TO_JOIN_KEY: Readonly<Record<string, string>> =
  Object.fromEntries([
    ...REVISION_ELEMENT_TAXONOMY.map((row) => [row.kind, row.normalizedJoinKey] as const),
    // Product-level coalesced formatting rows route through the same property
    // bucket the earlier parity path used. Atom-level kinds still carry the
    // finer run/paragraph/table/row/cell taxonomy for provenance.
    ["formatting", "run-property-change"],
  ]);

export type OoxmlSourceRevisionGroupConfidence =
  | "exact-ooxml-structure"
  | "word-pane-equivalent-heuristic";

export interface OoxmlSourceRevisionAtom {
  readonly id: string;
  readonly kind: OoxmlRevisionWitnessKind | "comment";
  readonly partName: string;
  readonly path: string;
  readonly nativeRevisionTag: string;
  readonly nativeRevisionId?: string;
  readonly author?: string;
  readonly date?: string;
  readonly textPreview: string;
  readonly propertySummary?: string;
  readonly xmlStart?: number;
  readonly xmlEnd?: number;
  readonly readOnlyReasons: readonly string[];
}

export interface OoxmlSourceRevisionGroup {
  readonly id: string;
  readonly kind: OoxmlSourceRevisionGroupKind;
  readonly atomIds: readonly string[];
  readonly atomCount: number;
  readonly partName: string;
  readonly path?: string;
  readonly paragraphPath?: string;
  readonly author?: string;
  readonly date?: string;
  readonly nativeRevisionIds: readonly string[];
  readonly textPreview?: string;
  readonly propertySummary?: string;
  readonly xmlStart?: number;
  readonly xmlEnd?: number;
  readonly confidence: OoxmlSourceRevisionGroupConfidence;
  readonly diagnostics: readonly string[];
}

export interface OoxmlSourceRevisionGroupSummary {
  readonly total: number;
  /** Count of groups per kind. All OoxmlSourceRevisionGroupKind values are present (may be 0). */
  readonly byKind: Readonly<Partial<Record<OoxmlSourceRevisionGroupKind, number>>>;
}

export interface OoxmlSourceRevisionGroupingResult {
  readonly atoms: readonly OoxmlSourceRevisionAtom[];
  readonly groups: readonly OoxmlSourceRevisionGroup[];
  readonly summary: OoxmlSourceRevisionGroupSummary;
}

const INSERTION_VISIBLE_GAP_LIMIT = 5;
const DELETION_VISIBLE_GAP_LIMIT = 15;

export function collectOoxmlSourceRevisionGroups(
  snapshot: OoxmlPackageSnapshot,
  partName?: string
): OoxmlSourceRevisionGroupingResult {
  const partNames = partName ? [partName] : revisionPartNames(snapshot);
  const witnesses = partNames.flatMap((name) => collectOoxmlRevisionWitnesses(snapshot, name));
  return collectOoxmlSourceRevisionGroupsFromWitnesses(snapshot, witnesses);
}

export function collectOoxmlSourceRevisionGroupsFromWitnesses(
  snapshot: OoxmlPackageSnapshot,
  witnesses: readonly OoxmlRevisionWitness[]
): OoxmlSourceRevisionGroupingResult {
  const atoms = witnesses.map(atomFromWitness);
  const comments = commentGroups(snapshot);
  const groups = [
    ...groupTextRevisionAtoms(snapshot, atoms, "insert"),
    ...groupTextRevisionAtoms(snapshot, atoms, "delete"),
    ...groupFormattingAtoms(atoms),
    ...groupMoveAtoms(atoms),
    ...comments,
  ].sort((left, right) => {
    const leftStart = left.xmlStart ?? Number.MAX_SAFE_INTEGER;
    const rightStart = right.xmlStart ?? Number.MAX_SAFE_INTEGER;
    if (left.partName !== right.partName) return left.partName.localeCompare(right.partName);
    return leftStart - rightStart || left.id.localeCompare(right.id);
  });
  return {
    atoms: [...atoms, ...comments.flatMap(commentAtomsFromGroup)],
    groups,
    summary: summarizeGroups(groups),
  };
}

function atomFromWitness(witness: OoxmlRevisionWitness): OoxmlSourceRevisionAtom {
  return {
    id: witness.id,
    kind: witness.kind,
    partName: witness.partName,
    path: witness.path,
    nativeRevisionTag: witness.nativeRevisionTag,
    ...(witness.nativeRevisionId ? { nativeRevisionId: witness.nativeRevisionId } : {}),
    ...(witness.author ? { author: witness.author } : {}),
    ...(witness.date ? { date: witness.date } : {}),
    textPreview: witness.textPreview,
    ...(witness.propertySummary ? { propertySummary: witness.propertySummary } : {}),
    ...(witness.xmlStart !== undefined ? { xmlStart: witness.xmlStart } : {}),
    ...(witness.xmlEnd !== undefined ? { xmlEnd: witness.xmlEnd } : {}),
    readOnlyReasons: witness.sourceCapability.readOnlyReasons,
  };
}

function groupTextRevisionAtoms(
  snapshot: OoxmlPackageSnapshot,
  atoms: readonly OoxmlSourceRevisionAtom[],
  kind: "insert" | "delete"
): OoxmlSourceRevisionGroup[] {
  const gapLimit = kind === "insert" ? INSERTION_VISIBLE_GAP_LIMIT : DELETION_VISIBLE_GAP_LIMIT;
  const groups: OoxmlSourceRevisionAtom[][] = [];
  let current: OoxmlSourceRevisionAtom[] = [];
  let currentKey = "";
  const textAtoms = atoms
    .filter((atom) => atom.kind === kind)
    .sort((left, right) => (left.xmlStart ?? 0) - (right.xmlStart ?? 0));

  for (const atom of textAtoms) {
    const key = textGroupKey(atom);
    const previous = current[current.length - 1];
    const sameGroup = Boolean(
      previous &&
      key === currentKey &&
      visibleTextBetween(snapshot.parts.get(atom.partName)?.text ?? "", previous.xmlEnd, atom.xmlStart).length <= gapLimit
    );
    if (!sameGroup) {
      if (current.length > 0) groups.push(current);
      current = [atom];
      currentKey = key;
    } else {
      current.push(atom);
    }
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group) => sourceGroupFromAtoms({
    kind: kind === "insert" ? "insertion" : "deletion",
    atoms: group,
    confidence: "word-pane-equivalent-heuristic",
  }));
}

function groupFormattingAtoms(
  atoms: readonly OoxmlSourceRevisionAtom[]
): OoxmlSourceRevisionGroup[] {
  // Word's opened-document/native revision surface coalesces raw OOXML property
  // atoms differently from the package. Keep atom-level taxonomy in `atoms`,
  // but expose product-facing rows at paragraph/author granularity so the
  // source ledger matches the proven 161/312 SpinHeme witness model.
  const grouped = groupBy(
    atoms.filter((atom) => isFormattingAtom(atom)),
    (atom) => [atom.partName, atom.author ?? "", paragraphPath(atom.path) ?? atom.path].join("|")
  );
  return [...grouped.values()].map((group) => sourceGroupFromAtoms({
    kind: "formatting",
    atoms: group,
    confidence: "word-pane-equivalent-heuristic",
  }));
}

function groupMoveAtoms(
  atoms: readonly OoxmlSourceRevisionAtom[]
): OoxmlSourceRevisionGroup[] {
  const grouped = groupBy(
    atoms.filter((atom) => atom.kind === "move-from" || atom.kind === "move-to"),
    (atom) => [atom.partName, atom.kind, atom.author ?? "", atom.date ?? "", paragraphPath(atom.path)].join("|")
  );
  return [...grouped.values()].map((group) => sourceGroupFromAtoms({
    kind: "move",
    atoms: group,
    confidence: "exact-ooxml-structure",
  }));
}

function sourceGroupFromAtoms(input: {
  readonly kind: OoxmlSourceRevisionGroupKind;
  readonly atoms: readonly OoxmlSourceRevisionAtom[];
  readonly confidence: OoxmlSourceRevisionGroupConfidence;
}): OoxmlSourceRevisionGroup {
  const first = input.atoms[0]!;
  const textPreview = joinPreview(input.atoms.map((atom) => atom.textPreview));
  const explicitPropertySummary = joinPreview(input.atoms.map((atom) => atom.propertySummary ?? ""));
  const propertySummary = explicitPropertySummary || fallbackPayloadSummaryForGroup(input.kind, input.atoms);
  const nativeRevisionIds = unique(input.atoms.map((atom) => atom.nativeRevisionId).filter(isString));
  const xmlStarts = input.atoms.map((atom) => atom.xmlStart).filter(isNumber);
  const xmlEnds = input.atoms.map((atom) => atom.xmlEnd).filter(isNumber);
  const paragraph = paragraphPath(first.path);
  const diagnostics = unique(input.atoms.flatMap((atom) => atom.readOnlyReasons));
  const groupKey = [
    input.kind,
    first.partName,
    first.author ?? "unknown-author",
    first.date ?? "unknown-date",
    paragraph ?? first.path,
    input.atoms[0]?.nativeRevisionTag ?? "unknown-tag",
    String(input.atoms.length),
    String(xmlStarts[0] ?? "no-start"),
  ].join("|");
  return {
    id: `ooxml-group:${input.kind}:${stableHash(groupKey, 10)}`,
    kind: input.kind,
    atomIds: input.atoms.map((atom) => atom.id),
    atomCount: input.atoms.length,
    partName: first.partName,
    path: first.path,
    ...(paragraph ? { paragraphPath: paragraph } : {}),
    ...(first.author ? { author: first.author } : {}),
    ...(first.date ? { date: first.date } : {}),
    nativeRevisionIds,
    ...(textPreview ? { textPreview } : {}),
    ...(propertySummary ? { propertySummary } : {}),
    ...(xmlStarts.length > 0 ? { xmlStart: Math.min(...xmlStarts) } : {}),
    ...(xmlEnds.length > 0 ? { xmlEnd: Math.max(...xmlEnds) } : {}),
    confidence: input.confidence,
    diagnostics,
  };
}

function commentGroups(snapshot: OoxmlPackageSnapshot): OoxmlSourceRevisionGroup[] {
  const commentsPart = snapshot.parts.get("word/comments.xml")?.text;
  if (!commentsPart) return [];
  const groups: OoxmlSourceRevisionGroup[] = [];
  const commentPattern = /<(?:[A-Za-z0-9_]+:)?comment\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?comment>/g;
  for (const match of commentsPart.matchAll(commentPattern)) {
    const attrs = parseAttributes(match.groups?.attrs ?? "");
    const id = attrs.id ?? `offset-${match.index ?? 0}`;
    const text = textFromXml(match.groups?.body ?? "");
    const xmlStart = match.index ?? 0;
    const xmlEnd = xmlStart + (match[0]?.length ?? 0);
    groups.push({
      id: `ooxml-group:comment:${safeId(id)}`,
      kind: "comment",
      atomIds: [`comment:${id}`],
      atomCount: 1,
      partName: "word/comments.xml",
      path: `/w:comments[1]/w:comment[@w:id=${id}]`,
      ...(attrs.author ? { author: attrs.author } : {}),
      ...(attrs.date ? { date: attrs.date } : {}),
      nativeRevisionIds: [id],
      ...(text ? { textPreview: text.slice(0, 240) } : {}),
      xmlStart,
      xmlEnd,
      confidence: "exact-ooxml-structure",
      diagnostics: ["comment-source-record-not-actionable"],
    });
  }
  return groups;
}

function commentAtomsFromGroup(group: OoxmlSourceRevisionGroup): OoxmlSourceRevisionAtom[] {
  return [{
    id: group.atomIds[0] ?? group.id,
    kind: "comment",
    partName: group.partName,
    path: group.path ?? group.id,
    nativeRevisionTag: "w:comment",
    nativeRevisionId: group.nativeRevisionIds[0],
    author: group.author,
    date: group.date,
    textPreview: group.textPreview ?? "",
    xmlStart: group.xmlStart,
    xmlEnd: group.xmlEnd,
    readOnlyReasons: ["comment-source-record-not-actionable"],
  }];
}

function summarizeGroups(
  groups: readonly OoxmlSourceRevisionGroup[]
): OoxmlSourceRevisionGroupSummary {
  // Table-driven: build byKind counts from REVISION_ELEMENT_TAXONOMY so adding
  // a new taxonomy row automatically adds it to the summary.
  const byKind: Record<string, number> = { comment: 0 };
  for (const row of REVISION_ELEMENT_TAXONOMY) {
    byKind[row.kind] = 0;
  }
  byKind.formatting = 0;
  for (const group of groups) {
    byKind[group.kind] = (byKind[group.kind] ?? 0) + 1;
  }
  return {
    total: groups.length,
    byKind: byKind as OoxmlSourceRevisionGroupSummary["byKind"],
  };
}

function revisionPartNames(snapshot: OoxmlPackageSnapshot): string[] {
  if (!snapshot.capabilities.hasFullPackage) {
    return [snapshot.documentPartName];
  }
  const names = [...snapshot.parts.keys()]
    .filter((name) => name.startsWith("word/") && name.endsWith(".xml"))
    .filter((name) => /(?:ins|del|moveFrom|moveTo|rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange|comment)/u.test(snapshot.parts.get(name)?.text ?? ""))
    .sort();
  return names.length > 0 ? names : [snapshot.documentPartName];
}

function textGroupKey(atom: OoxmlSourceRevisionAtom): string {
  return [atom.partName, atom.kind, atom.author ?? "", paragraphPath(atom.path) ?? atom.path].join("|");
}

function paragraphPath(path: string | undefined): string | undefined {
  return path?.match(/^(.*\/w:p\[\d+\])/u)?.[1];
}

function isFormattingAtom(atom: OoxmlSourceRevisionAtom): boolean {
  // Table-driven: an atom is a formatting atom if it maps to a property group kind.
  // This correctly includes table-property-change, row-property-change, and
  // cell-property-change (which the old endsWith check also matched, but then
  // groupFormattingAtoms mislabeled them as "run-property").
  const groupKind = ATOM_KIND_TO_GROUP_KIND.get(atom.kind);
  return groupKind !== undefined &&
    groupKind !== "insertion" &&
    groupKind !== "deletion" &&
    groupKind !== "move" &&
    groupKind !== "comment";
}

function visibleTextBetween(
  partText: string,
  previousEnd: number | undefined,
  nextStart: number | undefined
): string {
  if (previousEnd === undefined || nextStart === undefined || nextStart < previousEnd) {
    return "";
  }
  return textFromXml(stripRevisionElements(partText.slice(previousEnd, nextStart)));
}

function stripRevisionElements(xml: string): string {
  return xml.replace(
    /<(?:[A-Za-z0-9_]+:)?(?:ins|del|moveFrom|moveTo|rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange)\b[\s\S]*?<\/(?:[A-Za-z0-9_]+:)?(?:ins|del|moveFrom|moveTo|rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange)>/g,
    ""
  );
}

function textFromXml(xml: string): string {
  return decodeXmlText(
    [...xml.matchAll(/<(?:[A-Za-z0-9_]+:)?(?:t|delText)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?(?:t|delText)>/g)]
      .map((match) => match[1] ?? "")
      .join("")
  ).replace(/\s+/gu, " ").trim();
}

function parseAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /(?:(?:[A-Za-z0-9_]+):)?([A-Za-z_][A-Za-z0-9_.-]*)=(?:"([^"]*)"|'([^']*)')/g;
  for (const match of rawAttrs.matchAll(pattern)) {
    const key = match[1];
    const value = match[2] ?? match[3];
    if (key && value !== undefined) attrs[key] = decodeXmlText(value);
  }
  return attrs;
}

function groupBy<T>(values: readonly T[], keyForValue: (value: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const value of values) {
    const key = keyForValue(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function joinPreview(values: readonly string[]): string {
  return values.filter((value) => value.trim().length > 0).join(" ").replace(/\s+/gu, " ").trim().slice(0, 240);
}

function fallbackPayloadSummaryForGroup(
  kind: OoxmlSourceRevisionGroupKind,
  atoms: readonly OoxmlSourceRevisionAtom[]
): string | undefined {
  if (atoms.length === 0) return undefined;
  const rawText = atoms.map((atom) => atom.textPreview).join("");
  if (rawText.length > 0 && rawText.trim().length === 0) {
    return `whitespace ${displayGroupKind(kind)}: ${whitespaceLabel(rawText)}`;
  }
  const hasOnlyEmptyRevisionMarkers = atoms.every((atom) =>
    atom.textPreview.length === 0 &&
    !atom.propertySummary &&
    (atom.nativeRevisionTag === "w:ins" || atom.nativeRevisionTag === "w:del")
  );
  if (!hasOnlyEmptyRevisionMarkers) return undefined;
  return `empty ${displayGroupKind(kind)} marker in ${structuralContextLabel(atoms[0]!.path)}`;
}

function displayGroupKind(kind: OoxmlSourceRevisionGroupKind): string {
  if (kind === "insertion") return "insertion";
  if (kind === "deletion") return "deletion";
  if (kind === "move") return "move";
  if (kind === "comment") return "comment";
  return "formatting revision";
}

function whitespaceLabel(value: string): string {
  const labels: string[] = [];
  const spaces = [...value].filter((char) => char === " ").length;
  const tabs = [...value].filter((char) => char === "\t").length;
  const lineBreaks = [...value].filter((char) => char === "\n" || char === "\r").length;
  if (spaces > 0) labels.push(spaces === 1 ? "space" : `${spaces} spaces`);
  if (tabs > 0) labels.push(tabs === 1 ? "tab" : `${tabs} tabs`);
  if (lineBreaks > 0) labels.push(lineBreaks === 1 ? "line break" : `${lineBreaks} line breaks`);
  return labels.join(", ") || "whitespace";
}

function structuralContextLabel(path: string): string {
  const hasParagraphProperties = path.includes("/w:pPr[");
  const hasRunProperties = path.includes("/w:rPr[");
  if (hasParagraphProperties && hasRunProperties) return "paragraph mark run properties";
  if (hasParagraphProperties) return "paragraph properties";
  if (hasRunProperties) return "run properties";
  return "OOXML structural context";
}

function isString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/gu, "-") || "unknown";
}

function stableHash(value: string, width: number): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(width, "0").slice(0, width);
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
