/**
 * Browser-safe public seam for the stateful Word OOXML package codec.
 *
 * Phase 2.1 intentionally exposes only stable data shapes plus tiny runtime
 * sentinels/helpers. Package decode/encode and mutation logic belong to later
 * codec modules; this entrypoint must stay safe for the Word task pane bundle.
 */

export const OOXML_CODEC_VERSION = "0.1.0-skeleton" as const;

export type OoxmlPackageSource =
  | "full-package"
  | "body-ooxml"
  | "paragraph-ooxml"
  | "minimal";

export interface OoxmlPackageSnapshot {
  source: OoxmlPackageSource;
  freshnessVersion: string;
  parts: ReadonlyMap<string, OoxmlPart>;
  relationships: RelationshipGraph;
  contentTypes: ContentTypeIndex;
  documentPartName: "word/document.xml" | string;
  rootRelationshipsPartName: "_rels/.rels" | string;
  hashes: ReadonlyMap<string, string>;
  capabilities: OoxmlPackageCapabilities;
}

export interface OoxmlPackageCapabilities {
  hasFullPackage: boolean;
  canPreserveUntouchedParts: boolean;
  canAllocateRelationships: boolean;
}

export interface OoxmlPart {
  name: string;
  contentType?: string;
  bytes?: Uint8Array;
  text?: string;
  hash: string;
  parsed?: unknown;
}

export interface ContentTypeIndex {
  defaults: ReadonlyMap<string, string>;
  overrides: ReadonlyMap<string, string>;
}

export interface RelationshipGraph {
  byPart: ReadonlyMap<string, RelationshipTable>;
}

export interface RelationshipTable {
  partName: string;
  relationships: ReadonlyMap<string, OoxmlRelationship>;
}

export interface OoxmlRelationship {
  id: string;
  type: string;
  target: string;
  targetMode?: "External" | "Internal" | string;
}

export type OoxmlEvent =
  | { kind: "partStart"; partName: string }
  | {
      kind: "revisionStart";
      partName: string;
      path: string;
      type: "ins" | "del";
      author?: string;
      date?: string;
      xml?: string;
      xmlStart?: number;
      xmlEnd?: number;
    }
  | {
      kind: "revisionEnd";
      partName: string;
      path: string;
      type: "ins" | "del";
      xmlStart?: number;
      xmlEnd?: number;
    }
  | {
      kind: "elementStart";
      partName: string;
      path: string;
      name: string;
      attrs: Readonly<Record<string, string>>;
      xml?: string;
      xmlStart?: number;
      xmlEnd?: number;
    }
  | {
      kind: "text";
      partName: string;
      path: string;
      text: string;
      runStyle: OoxmlRunStyle;
      plainStart: number;
      plainEnd: number;
      xml?: string;
      xmlStart?: number;
      xmlEnd?: number;
      textStart?: number;
      textEnd?: number;
    }
  | {
      kind: "protected";
      partName: string;
      path: string;
      xml: string;
      reason: ProtectedOoxmlReason;
      relationshipIds?: readonly string[];
      xmlStart?: number;
      xmlEnd?: number;
    }
  | { kind: "elementEnd"; partName: string; path: string; name: string }
  | { kind: "partEnd"; partName: string };

export interface OoxmlStreamOptions {
  readonly revisions?: "protected" | "semantic";
}

export interface OoxmlRunStyle {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  code?: boolean;
  hyperlinkRelationshipId?: string;
}

export type OoxmlToken =
  | OoxmlTextToken
  | OoxmlMarkupToken
  | ProtectedOoxmlToken
  | OoxmlMathToken
  | OoxmlFigureToken;

export interface OoxmlTextToken {
  kind: "text";
  partName: string;
  path: string;
  text: string;
  style?: OoxmlRunStyle;
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
  xmlStart?: number;
  xmlEnd?: number;
  textStart?: number;
  textEnd?: number;
  preservation?: OoxmlTokenPreservation;
}

export interface OoxmlMarkupToken {
  kind: "markup";
  partName: string;
  path: string;
  xml: string;
  xmlStart?: number;
  xmlEnd?: number;
  preservation?: OoxmlTokenPreservation;
  role?:
    | "paragraph-properties"
    | "run-properties"
    | "relationship-backed"
    | string;
}

export interface ProtectedOoxmlToken {
  kind: "protected";
  partName: string;
  path: string;
  xml: string;
  reason: ProtectedOoxmlReason;
  plainStart?: number;
  plainEnd?: number;
  markdownStart?: number;
  markdownEnd?: number;
  relationshipIds?: readonly string[];
  xmlStart?: number;
  xmlEnd?: number;
  preservation?: OoxmlTokenPreservation;
}

export interface OoxmlMathToken {
  kind: "math";
  partName: string;
  path: string;
  displayMode: boolean;
  latex: string;
  ommlXml: string;
  latexHash: string;
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
  xmlStart?: number;
  xmlEnd?: number;
  preservation?: OoxmlTokenPreservation;
}

export interface OoxmlFigureToken {
  kind: "figure";
  partName: string;
  path: string;
  drawingXml: string;
  inline: boolean;
  relationshipIds: readonly string[];
  primaryMediaPartName?: string;
  fallbackMediaPartNames?: readonly string[];
  contentTypes?: Readonly<Record<string, string>>;
  mediaHash?: string;
  markdownSrc: string;
  altText?: string;
  title?: string;
  description?: string;
  extentEmu?: { width: number; height: number };
  positionMetadata?: Readonly<Record<string, string>>;
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
  xmlStart?: number;
  xmlEnd?: number;
  preservation?: OoxmlTokenPreservation;
}

export type OoxmlTokenPreservation =
  | "editable-plain"
  | "editable-modeled-style"
  | "semantic-preserved"
  | "semantic-regenerated"
  | "protected"
  | "unsupported";

export type ProtectedOoxmlReason =
  | "drawing"
  | "footnote-reference"
  | "endnote-reference"
  | "comment-range"
  | "field"
  | "bookmark"
  | "content-control"
  | "move-range"
  | "existing-revision"
  | "math"
  | "unknown-relationship"
  | "unsupported-run-properties";

export interface OoxmlRegionProjection {
  handle: RegionHandle;
  containerPath: string;
  plainText: string;
  markdownText: string;
  offsetMap: readonly OoxmlOffsetMapEntry[];
  tokens: readonly OoxmlToken[];
  protectedTokens: readonly ProtectedOoxmlToken[];
  relationshipsUsed: readonly string[];
}

export interface RegionHandle {
  partName: string;
  path: string;
  paragraphIndex?: number;
  paragraphId?: string;
  uniqueLocalId?: string;
  structuralPath?: string;
}

export interface OoxmlOffsetMapEntry {
  plainStart: number;
  plainEnd: number;
  markdownStart: number;
  markdownEnd: number;
}

export interface OoxmlPatchResult {
  snapshot: OoxmlPackageSnapshot;
  changedParts: readonly string[];
  relationshipChanges: readonly RelationshipChange[];
  validation: OoxmlValidationResult;
}

export interface RelationshipChange {
  partName: string;
  relationshipId: string;
  kind: "added" | "updated" | "removed";
  before?: OoxmlRelationship;
  after?: OoxmlRelationship;
}

export interface OoxmlValidationResult {
  ok: boolean;
  changedParts: readonly string[];
  unchangedPartHashes: Readonly<Record<string, string>>;
  relationshipErrors: readonly string[];
  protectedTokenErrors: readonly string[];
  witnessWarnings: readonly string[];
  warnings: readonly string[];
  expectedPlainBefore?: string;
  actualPlainBefore?: string;
  expectedPlainAfter?: string;
  actualPlainAfter?: string;
  expectedMarkdownAfter?: string;
  actualMarkdownAfter?: string;
}

export function createEmptyOoxmlValidationResult(): OoxmlValidationResult {
  return {
    ok: true,
    changedParts: [],
    unchangedPartHashes: {},
    relationshipErrors: [],
    protectedTokenErrors: [],
    witnessWarnings: [],
    warnings: [],
  };
}

export { ContentTypesEditor } from "./content-types.js";
export { allocateMediaPartName, dataUriToMediaPart, stableBytesHash } from "./media.js";
export type { ParsedDataUriMediaPart } from "./media.js";
export { decodeOoxmlPackage, encodeOoxmlPackage } from "./package.js";
export type { OoxmlPackageInput } from "./package.js";
export { streamOoxmlPartEvents } from "./events.js";
export {
  collectOoxmlRevisionWitnesses,
  type CapabilityAvailability,
  type OoxmlRevisionContainerContext,
  type OoxmlRevisionContainerKind,
  type OoxmlRevisionSourceCapability,
  type OoxmlRevisionWitness,
  type OoxmlRevisionWitnessKind,
} from "./revision-witness.js";
export { projectOoxmlRevisionsToCurrentBody } from "./revisions.js";
export type {
  ChangeDownRecord,
  OoxmlProjectedRevision,
  OoxmlRevisionProjection,
} from "./revisions.js";
export { projectOoxmlRegions } from "./region.js";
export { formattingPlanToOoxmlRuns, formattingPlanToSemanticOoxmlRuns } from "./runs.js";
export {
  buildInlineDrawingXml,
  imageMarkdown,
  projectOoxmlFigureToken,
} from "./figures.js";
export type {
  BuildInlineDrawingXmlInput,
  ProjectOoxmlFigureTokenInput,
} from "./figures.js";
export {
  latexToOmmlXml,
  mathMarkdown,
  ommlToLatex,
  projectOoxmlMathToken,
  stableStringHash,
} from "./math.js";
export { parseStandaloneSemanticMarkdown } from "./semantic-markdown.js";
export type { ProjectOoxmlMathTokenInput } from "./math.js";
export {
  applyOoxmlTableInsertion,
  applyOoxmlTableRowInsertion,
  markdownTableToMarkdown,
  markdownTableToOoxml,
  parseMarkdownTable,
  parseMarkdownTableRows,
  projectOoxmlTables,
} from "./tables.js";
export { validatePatchPreservation } from "./validation.js";
export type {
  FormattingPlanToOoxmlRunsInput,
  FormattingPlanToOoxmlRunsResult,
} from "./runs.js";
export type {
  ApplyOoxmlTableInsertionInput,
  ApplyOoxmlTableRowInsertionInput,
  MarkdownTableModel,
  MarkdownTableToOoxmlResult,
  OoxmlTableProjection,
  TableAlignment,
} from "./tables.js";
export { applyOoxmlRegionPatch, applyOoxmlRegionPatchAsync } from "./patch.js";
export type { ApplyOoxmlRegionPatchInput } from "./patch.js";
export { createOoxmlPackageCodec } from "./codec.js";
export type {
  ApplyPackageDeltaInput,
  CodecDiagnostic,
  CodecProjection,
  OoxmlPackageCodec,
  OoxmlProjection,
  PackageLedger,
  ProjectPackageInput,
  ValidatePackagePatchInput,
} from "./codec.js";
export {
  isChangedownCompareCommentMetadataText,
  normalizeChangeDownAuthorHandle,
  parseWordChangeDownCommentMetadata,
  serializeWordChangeDownCommentMetadata,
  toChangeDownDiscussion,
  type WordChangeDownCommentMetadata,
  type WordChangeDownCommentReply,
} from "./comment-metadata.js";
export {
  RelationshipAllocator,
  parseRelationshipGraph,
  parseRelationshipPartNameToSourcePartName,
  parseRelationshipTableXml,
  relationshipPartNameForSourcePartName,
  resolveRelationshipTarget,
  serializeRelationshipTableXml,
  validateRelationshipGraph,
} from "./relationships.js";
export type { ParsedRelationshipTable } from "./relationships.js";

export * from "./source-transition.js";
