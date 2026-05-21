import {
  ChangeType,
  buildContextualL3EditOp,
  computeLineHash,
} from "@changedown/core";
import { projectFormattedRunsToMarkdown, type FormattedRun } from "../inline-codec/index.js";
import { applyOoxmlRegionPatchAsync } from "./patch.js";
import { streamOoxmlPartEvents } from "./events.js";
import { projectOoxmlRegions, projectOoxmlRegionsFromEvents } from "./region.js";
import { projectOoxmlRevisionsToCurrentBody } from "./revisions.js";
import type { ChangeDownRecord } from "./revisions.js";
import {
  collectOoxmlRevisionWitnesses,
  collectOoxmlRevisionWitnessesAsync,
} from "./revision-witness.js";
import type { OoxmlRevisionWitness } from "./revision-witness.js";
import {
  collectOoxmlSourceRevisionGroups,
  collectOoxmlSourceRevisionGroupsFromWitnesses,
} from "./revision-groups.js";
import type { OoxmlSourceRevisionGroup, OoxmlSourceRevisionGroupSummary } from "./revision-groups.js";
import {
  applyOoxmlTableInsertion,
  applyOoxmlTableRowInsertion,
  projectOoxmlTables,
} from "./tables.js";
import { validateRelationshipGraph } from "./relationships.js";
import type {
  OoxmlPackageSnapshot,
  OoxmlPatchResult,
  OoxmlRegionProjection,
  OoxmlTableProjection,
  OoxmlEvent,
  OoxmlToken,
  OoxmlValidationResult,
  RegionHandle,
} from "./index.js";

export interface OoxmlPackageCodec {
  project(input: ProjectPackageInput): OoxmlProjection;
  applyDelta(input: ApplyPackageDeltaInput): Promise<OoxmlPatchResult>;
  validate(input: ValidatePackagePatchInput): OoxmlValidationResult;
}

export interface ProjectPackageInput {
  snapshot: OoxmlPackageSnapshot;
}

export type OoxmlProjectionPhase =
  | "regions"
  | "tables"
  | "revision-records"
  | "revision-witnesses"
  | "revision-groups"
  | "semantic-paragraphs"
  | "body-assembly"
  | "record-anchoring"
  | "source-ledger-artifact"
  | "package-ledger";

export interface ProjectPackageAsyncOptions {
  /**
   * Called after each completed projection phase. The default is a resolved
   * promise so Node callers can opt into async equivalence without host
   * scheduling behavior.
   */
  yieldToHost?: () => Promise<void>;
  trace?: (
    phase: OoxmlProjectionPhase,
    state: "started" | "progress" | "done",
    detail?: Record<string, unknown>
  ) => void;
  /**
   * Live-lab diagnostic mode: preserve per-witness start/done traces around
   * expensive witness assembly. Keep disabled by default so ordinary traces
   * retain high-level phase signal in the bounded pane trace buffer.
   */
  traceRevisionWitnessDetails?: boolean;
}

export interface CodecDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
}

export interface PackageLedger {
  readonly source: OoxmlPackageSnapshot["source"];
  readonly documentPartName: string;
  readonly hashCoverage: "complete" | "partial";
  readonly includedPartNames: readonly string[];
  readonly partHashes: Readonly<Record<string, string>>;
}

export interface SourceLedgerArtifactFormattingRun {
  readonly kind: "formatting";
  readonly summary: string;
  readonly atomIds: readonly string[];
}

export interface SourceLedgerArtifactGroup {
  readonly groupId: string;
  readonly kind: OoxmlSourceRevisionGroup["kind"];
  readonly atomIds: readonly string[];
  readonly partName: string;
  readonly path?: string;
  readonly author?: string;
  readonly date?: string;
  readonly diagnostics: readonly string[];
  readonly canonicalMarkdownPreview: string;
  readonly ooxmlSnippet: string;
  readonly blockSnippet: string;
  readonly formattingRuns: readonly SourceLedgerArtifactFormattingRun[];
  readonly relationships: readonly string[];
}

export interface SourceLedgerArtifact {
  readonly bodyMarkdown: string;
  readonly groups: readonly SourceLedgerArtifactGroup[];
}

export interface CodecProjection {
  readonly source: string;
  readonly bodyMarkdown: string;
  readonly records: readonly ChangeDownRecord[];
  readonly regions: readonly OoxmlRegionProjection[];
  readonly tokens: readonly OoxmlToken[];
  readonly revisionWitnesses: readonly OoxmlRevisionWitness[];
  readonly revisionGroups: readonly OoxmlSourceRevisionGroup[];
  readonly revisionGroupSummary: OoxmlSourceRevisionGroupSummary;
  readonly sourceLedgerArtifact: SourceLedgerArtifact;
  readonly packageLedger: PackageLedger;
  readonly diagnostics: readonly CodecDiagnostic[];
}

export interface OoxmlProjection extends CodecProjection {
  snapshot: OoxmlPackageSnapshot;
  tables: readonly OoxmlTableProjection[];
}

export type ApplyPackageDeltaInput =
  | {
      snapshot: OoxmlPackageSnapshot;
      regionHandle: RegionHandle;
      kind: "insert";
      plainStart: number;
      markdown: string;
      blockKind?: "inline" | "table" | "table-row";
    }
  | {
      snapshot: OoxmlPackageSnapshot;
      regionHandle: RegionHandle;
      kind: "delete";
      plainStart: number;
      plainEnd: number;
    }
  | {
      snapshot: OoxmlPackageSnapshot;
      regionHandle: RegionHandle;
      kind: "substitute";
      plainStart: number;
      plainEnd: number;
      markdown: string;
    };

export interface ValidatePackagePatchInput {
  snapshot: OoxmlPackageSnapshot;
  changedParts?: readonly string[];
}

export function createOoxmlPackageCodec(): OoxmlPackageCodec {
  return {
    project(input) {
      return projectOoxmlPackageSync(input);
    },
    async applyDelta(input) {
      assertFullPackageMutation(input.snapshot);
      if (input.kind === "insert") {
        if (input.blockKind === "table") {
          return applyOoxmlTableInsertion({
            snapshot: input.snapshot,
            handle: input.regionHandle,
            column: input.plainStart,
            markdown: input.markdown,
          });
        }
        if (input.blockKind === "table-row") {
          return applyOoxmlTableRowInsertion({
            snapshot: input.snapshot,
            handle: input.regionHandle,
            markdown: input.markdown,
            position: "after",
          });
        }
        return applyOoxmlRegionPatchAsync({
          snapshot: input.snapshot,
          handle: input.regionHandle,
          plainStart: input.plainStart,
          plainEnd: input.plainStart,
          replacementMarkdown: input.markdown,
        });
      }
      if (input.kind === "delete") {
        return applyOoxmlRegionPatchAsync({
          snapshot: input.snapshot,
          handle: input.regionHandle,
          plainStart: input.plainStart,
          plainEnd: input.plainEnd,
          replacementMarkdown: "",
        });
      }
      return applyOoxmlRegionPatchAsync({
        snapshot: input.snapshot,
        handle: input.regionHandle,
        plainStart: input.plainStart,
        plainEnd: input.plainEnd,
        replacementMarkdown: input.markdown,
      });
    },
    validate(input) {
      return validateRelationshipGraph(input.snapshot);
    },
  };
}

export function projectOoxmlPackageSync(
  input: ProjectPackageInput
): OoxmlProjection {
  const semanticEvents = streamSemanticDocumentEvents(input.snapshot);
  const regions = semanticEvents
    ? projectOoxmlRegionsFromEvents(input.snapshot, semanticEvents)
    : projectOoxmlRegions(input.snapshot);
  const tables = projectOoxmlTables(input.snapshot);
  const revisionProjection = projectRevisionProjectionFromEvents(
    input.snapshot,
    semanticEvents
  );
  const revisionWitnesses = collectPackageRevisionWitnesses(input.snapshot);
  const revisionGrouping = collectOoxmlSourceRevisionGroups(input.snapshot);
  const bodyRegions = regions.filter((region) => !isRegionInsideTable(region));
  const semanticParagraphs = projectSemanticRevisionParagraphsFromEvents(
    input.snapshot,
    semanticEvents
  );
  const bodyAssembly = assembleBodyMarkdown(bodyRegions, tables, semanticParagraphs);
  const bodyMarkdown = bodyAssembly.bodyMarkdown;
  const records = anchorProjectionRecords({
    snapshot: input.snapshot,
    bodyMarkdown,
    revisionRecords: revisionProjection.records,
    lineByContainerPath: bodyAssembly.lineByContainerPath,
  });
  const sourceLedgerArtifact = buildSourceLedgerArtifact(
    input.snapshot,
    bodyMarkdown,
    revisionGrouping.groups
  );
  const packageLedger = buildPackageLedger(input.snapshot);

  return assembleOoxmlProjection({
    snapshot: input.snapshot,
    regions,
    tables,
    bodyRegions,
    semanticParagraphs,
    bodyMarkdown,
    records,
    revisionWitnesses,
    revisionGrouping,
    sourceLedgerArtifact,
    packageLedger,
  });
}

export async function projectOoxmlPackageAsync(
  input: ProjectPackageInput,
  options: ProjectPackageAsyncOptions = {}
): Promise<OoxmlProjection> {
  const yieldToHost = options.yieldToHost ?? (() => Promise.resolve());
  const runPhase = async <T>(
    phase: OoxmlProjectionPhase,
    fn: () => T,
    detail: (value: T) => Record<string, unknown> = () => ({})
  ): Promise<T> => {
    options.trace?.(phase, "started");
    await yieldToHost();
    const value = fn();
    options.trace?.(phase, "done", detail(value));
    await yieldToHost();
    return value;
  };

  let semanticEvents: readonly OoxmlEvent[] | undefined;
  const revisionProjection = await runPhase(
    "revision-records",
    () => {
      semanticEvents = streamSemanticDocumentEvents(input.snapshot);
      return projectRevisionProjectionFromEvents(input.snapshot, semanticEvents);
    },
    (value) => ({
      count: value.records.length,
      eventCount: semanticEvents?.length ?? 0,
    })
  );
  const regions = await runPhase(
    "regions",
    () =>
      semanticEvents
        ? projectOoxmlRegionsFromEvents(input.snapshot, semanticEvents)
        : projectOoxmlRegions(input.snapshot),
    (value) => ({
      count: value.length,
      eventSource: semanticEvents ? "semantic-reused" : "protected-stream",
    })
  );
  const tables = await runPhase("tables", () => projectOoxmlTables(input.snapshot), (value) => ({
    count: value.length,
  }));
  options.trace?.("revision-witnesses", "started");
  await yieldToHost();
  const revisionWitnesses = await collectPackageRevisionWitnessesAsync(
    input.snapshot,
    {
      yieldToHost,
      traceWitnessDetails: options.traceRevisionWitnessDetails === true,
      trace: (detail) =>
        options.trace?.("revision-witnesses", "progress", detail),
    }
  );
  options.trace?.("revision-witnesses", "done", {
    count: revisionWitnesses.length,
  });
  await yieldToHost();
  const revisionGrouping = await runPhase(
    "revision-groups",
    () => collectOoxmlSourceRevisionGroupsFromWitnesses(input.snapshot, revisionWitnesses),
    (value) => ({
      count: value.groups.length,
      byKind: value.summary.byKind,
    })
  );
  const bodyRegions = regions.filter((region) => !isRegionInsideTable(region));
  options.trace?.("semantic-paragraphs", "started", {
    eventCount: semanticEvents?.length ?? 0,
  });
  await yieldToHost();
  const semanticParagraphs = await projectSemanticRevisionParagraphsFromEventsAsync(
    input.snapshot,
    semanticEvents,
    {
      yieldToHost,
      trace: (detail) =>
        options.trace?.("semantic-paragraphs", "progress", detail),
    }
  );
  options.trace?.("semantic-paragraphs", "done", {
    count: semanticParagraphs.size,
    eventCount: semanticEvents?.length ?? 0,
  });
  await yieldToHost();
  const bodyAssembly = await runPhase(
    "body-assembly",
    () => assembleBodyMarkdown(bodyRegions, tables, semanticParagraphs),
    (value) => ({
      bodyChars: value.bodyMarkdown.length,
      anchoredContainerCount: value.lineByContainerPath.size,
    })
  );
  const bodyMarkdown = bodyAssembly.bodyMarkdown;
  const records = await runPhase(
    "record-anchoring",
    () =>
      anchorProjectionRecords({
        snapshot: input.snapshot,
        bodyMarkdown,
        revisionRecords: revisionProjection.records,
        lineByContainerPath: bodyAssembly.lineByContainerPath,
      }),
    (value) => ({ count: value.length })
  );
  const sourceLedgerArtifact = await runPhase(
    "source-ledger-artifact",
    () => buildSourceLedgerArtifact(input.snapshot, bodyMarkdown, revisionGrouping.groups),
    (value) => ({ count: value.groups.length })
  );
  const packageLedger = await runPhase(
    "package-ledger",
    () => buildPackageLedger(input.snapshot),
    (value) => ({ partCount: Object.keys(value.partHashes).length })
  );

  return assembleOoxmlProjection({
    snapshot: input.snapshot,
    regions,
    tables,
    bodyRegions,
    semanticParagraphs,
    bodyMarkdown,
    records,
    revisionWitnesses,
    revisionGrouping,
    sourceLedgerArtifact,
    packageLedger,
  });
}


function anchorProjectionRecords(input: {
  snapshot: OoxmlPackageSnapshot;
  bodyMarkdown: string;
  revisionRecords: readonly ChangeDownRecord[];
  lineByContainerPath: ReadonlyMap<string, number>;
}): ChangeDownRecord[] {
  return [
    buildCodecGenesisRecord(input.bodyMarkdown, input.snapshot),
    ...anchorRevisionRecords(
      input.revisionRecords,
      input.bodyMarkdown,
      input.lineByContainerPath
    ),
  ];
}

function assembleOoxmlProjection(input: {
  snapshot: OoxmlPackageSnapshot;
  regions: readonly OoxmlRegionProjection[];
  tables: readonly OoxmlTableProjection[];
  bodyRegions: readonly OoxmlRegionProjection[];
  semanticParagraphs: ReadonlyMap<string, SemanticParagraphProjection>;
  bodyMarkdown: string;
  records: readonly ChangeDownRecord[];
  revisionWitnesses: readonly OoxmlRevisionWitness[];
  revisionGrouping: {
    readonly groups: readonly OoxmlSourceRevisionGroup[];
    readonly summary: OoxmlSourceRevisionGroupSummary;
  };
  sourceLedgerArtifact: SourceLedgerArtifact;
  packageLedger: PackageLedger;
}): OoxmlProjection {
  return {
    snapshot: input.snapshot,
    source: serializeChangeDownSource({
      bodyMarkdown: input.bodyMarkdown,
      records: input.records,
    }),
    bodyMarkdown: input.bodyMarkdown,
    records: input.records,
    regions: input.regions,
    tables: input.tables,
    tokens: input.bodyRegions
      .filter((region) => !input.semanticParagraphs.has(region.containerPath))
      .flatMap((region) => region.tokens),
    revisionWitnesses: input.revisionWitnesses,
    revisionGroups: input.revisionGrouping.groups,
    revisionGroupSummary: input.revisionGrouping.summary,
    sourceLedgerArtifact: input.sourceLedgerArtifact,
    packageLedger: input.packageLedger,
    diagnostics: [],
  };
}

function buildSourceLedgerArtifact(
  snapshot: OoxmlPackageSnapshot,
  bodyMarkdown: string,
  revisionGroups: readonly OoxmlSourceRevisionGroup[]
): SourceLedgerArtifact {
  return {
    bodyMarkdown,
    groups: revisionGroups.map((group) => {
      const packageXml = snapshot.parts.get(group.partName)?.text ?? "";
      const ooxmlSnippet = sliceByOffsets(packageXml, group.xmlStart, group.xmlEnd);
      return {
        groupId: group.id,
        kind: group.kind,
        atomIds: group.atomIds.slice(),
        partName: group.partName,
        ...(group.path ? { path: group.path } : {}),
        ...(group.author ? { author: group.author } : {}),
        ...(group.date ? { date: group.date } : {}),
        diagnostics: group.diagnostics.slice(),
        canonicalMarkdownPreview: group.textPreview ?? group.propertySummary ?? "",
        ooxmlSnippet,
        blockSnippet: sliceContainingBlock(packageXml, group.xmlStart, group.xmlEnd),
        formattingRuns: collectFormattingRunsForGroup(group),
        relationships: collectRelationshipsForGroup(snapshot, group, ooxmlSnippet),
      };
    }),
  };
}

function sliceByOffsets(
  xml: string,
  start: number | undefined,
  end: number | undefined
): string {
  if (start === undefined || end === undefined || start < 0 || end <= start) {
    return "";
  }
  return xml.slice(start, Math.min(end, xml.length));
}

function sliceContainingBlock(
  xml: string,
  start: number | undefined,
  end: number | undefined
): string {
  if (start === undefined || end === undefined || start < 0 || end <= start) {
    return "";
  }
  const blockStart = Math.max(xml.lastIndexOf("<w:p", start), 0);
  const blockEndTag = xml.indexOf("</w:p>", end);
  if (blockEndTag < 0) return sliceByOffsets(xml, start, end);
  return xml.slice(blockStart, blockEndTag + "</w:p>".length);
}

function collectFormattingRunsForGroup(
  group: OoxmlSourceRevisionGroup
): readonly SourceLedgerArtifactFormattingRun[] {
  if (group.kind !== "formatting") return [];
  return [
    {
      kind: "formatting",
      summary: group.propertySummary ?? group.textPreview ?? "formatting change",
      atomIds: group.atomIds.slice(),
    },
  ];
}

function collectRelationshipsForGroup(
  snapshot: OoxmlPackageSnapshot,
  group: OoxmlSourceRevisionGroup,
  snippet: string
): readonly string[] {
  const relationshipIds = new Set<string>();
  for (const match of snippet.matchAll(/(?:r:id|r:embed|r:link)="([^"]+)"/gu)) {
    relationshipIds.add(match[1]!);
  }
  if (relationshipIds.size === 0) return [];
  const table = snapshot.relationships.byPart.get(group.partName)?.relationships;
  if (!table) return [...relationshipIds].sort();
  return [...relationshipIds]
    .sort()
    .map((id) => {
      const relationship = table.get(id);
      return relationship ? `${id}:${relationship.type}:${relationship.target}` : id;
    });
}

function collectPackageRevisionWitnesses(snapshot: OoxmlPackageSnapshot): readonly OoxmlRevisionWitness[] {
  return revisionPartNames(snapshot).flatMap((partName) =>
    collectOoxmlRevisionWitnesses(snapshot, partName)
  );
}

async function collectPackageRevisionWitnessesAsync(
  snapshot: OoxmlPackageSnapshot,
  options: {
    yieldToHost: () => Promise<void>;
    traceWitnessDetails?: boolean;
    trace?: (detail: Record<string, unknown>) => void;
  }
): Promise<readonly OoxmlRevisionWitness[]> {
  const witnesses: OoxmlRevisionWitness[] = [];
  const partNames = revisionPartNames(snapshot);
  for (const partName of partNames) {
    options.trace?.({
      stage: "part-started",
      partName,
      partIndex: partNames.indexOf(partName),
      partCount: partNames.length,
    });
    const partWitnesses = await collectOoxmlRevisionWitnessesAsync(
      snapshot,
      partName,
      {
        yieldToHost: options.yieldToHost,
        traceWitnessDetails: options.traceWitnessDetails === true,
        trace: (detail) =>
          options.trace?.({
            ...detail,
            partName,
            accumulatedWitnessCount: witnesses.length,
          }),
      }
    );
    witnesses.push(...partWitnesses);
    options.trace?.({
      stage: "part-done",
      partName,
      partWitnessCount: partWitnesses.length,
      accumulatedWitnessCount: witnesses.length,
    });
    await options.yieldToHost();
  }
  return witnesses;
}

function revisionPartNames(snapshot: OoxmlPackageSnapshot): string[] {
  if (!snapshot.capabilities.hasFullPackage) {
    return [snapshot.documentPartName];
  }
  const names = [...snapshot.parts.keys()]
    .filter((name) => name.startsWith("word/") && name.endsWith(".xml"))
    .filter((name) => /(?:ins|del|moveFrom|moveTo|rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange)/u.test(snapshot.parts.get(name)?.text ?? ""))
    .sort();
  return names.length > 0 ? names : [snapshot.documentPartName];
}

function assertFullPackageMutation(snapshot: OoxmlPackageSnapshot): void {
  if (
    (snapshot.source !== "package-ooxml" && snapshot.source !== "full-package") ||
    !snapshot.capabilities.hasFullPackage ||
    !snapshot.capabilities.canPreserveUntouchedParts
  ) {
    throw new Error(
      "OOXML package codec requires full-package evidence for mutation"
    );
  }
}

function streamSemanticDocumentEvents(
  snapshot: OoxmlPackageSnapshot
): readonly OoxmlEvent[] | undefined {
  try {
    return streamOoxmlPartEvents(snapshot, snapshot.documentPartName, {
      revisions: "semantic",
    });
  } catch {
    return undefined;
  }
}

function projectRevisionProjectionFromEvents(
  snapshot: OoxmlPackageSnapshot,
  events: readonly OoxmlEvent[] | undefined
): {
  readonly body: string;
  readonly records: readonly ChangeDownRecord[];
} {
  if (!events) return { body: "", records: [] };
  return projectOoxmlRevisionsToCurrentBody(events, {
    relationshipTarget: (partName, relationshipId) =>
      relationshipTarget(snapshot, partName, relationshipId),
  });
}

function assembleBodyMarkdown(
  regions: readonly OoxmlRegionProjection[],
  tables: readonly OoxmlTableProjection[],
  semanticParagraphs: ReadonlyMap<string, SemanticParagraphProjection>
): {
  bodyMarkdown: string;
  lineByContainerPath: ReadonlyMap<string, number>;
} {
  const blocks = [
    ...regions.map((region) => {
      const semantic = semanticParagraphs.get(region.containerPath);
      return {
        markdownText: semantic?.markdownText ?? region.markdownText,
        xmlStart: semantic?.xmlStart ?? firstRegionXmlStart(region),
        containerPath: region.containerPath,
      };
    }),
    ...tables.map((table) => ({
      markdownText: table.markdownText,
      xmlStart: table.xmlStart,
      containerPath: undefined,
    })),
  ]
    .filter((block) => block.markdownText.length > 0)
    .sort((left, right) => left.xmlStart - right.xmlStart);
  const lineByContainerPath = new Map<string, number>();
  const bodyParts: string[] = [];
  let lineNumber = 1;
  for (const block of blocks) {
    if (block.containerPath) {
      lineByContainerPath.set(block.containerPath, lineNumber);
    }
    bodyParts.push(block.markdownText);
    lineNumber += block.markdownText.split("\n").length + 1;
  }
  return {
    bodyMarkdown: bodyParts.join("\n\n"),
    lineByContainerPath,
  };
}

interface SemanticParagraphProjection {
  readonly markdownText: string;
  readonly xmlStart: number;
}

function projectSemanticRevisionParagraphsFromEvents(
  snapshot: OoxmlPackageSnapshot,
  events: readonly OoxmlEvent[] | undefined
): ReadonlyMap<string, SemanticParagraphProjection> {
  const result = new Map<string, SemanticParagraphProjection>();
  if (!events) return result;
  try {
    let current:
      | { path: string; xmlStart: number; runs: FormattedRun[]; hasRevision: boolean }
      | undefined;
    const revisionStack: Array<"ins" | "del"> = [];

    for (const event of events) {
      current = updateSemanticParagraphState(
        snapshot,
        result,
        revisionStack,
        current,
        event
      );
    }
  } catch {
    return result;
  }
  return result;
}

function updateSemanticParagraphState(
  snapshot: OoxmlPackageSnapshot,
  result: Map<string, SemanticParagraphProjection>,
  revisionStack: Array<"ins" | "del">,
  current: { path: string; xmlStart: number; runs: FormattedRun[]; hasRevision: boolean } | undefined,
  event: OoxmlEvent
): { path: string; xmlStart: number; runs: FormattedRun[]; hasRevision: boolean } | undefined {
  if (event.kind === "elementStart" && event.name === "w:p") {
    return {
      path: event.path,
      xmlStart: event.xmlStart ?? Number.MAX_SAFE_INTEGER,
      runs: [],
      hasRevision: false,
    };
  }

  if (!current) return current;

  if (event.kind === "revisionStart") {
    revisionStack.push(event.type);
    current.hasRevision = true;
    return current;
  }

  if (event.kind === "revisionEnd") {
    revisionStack.pop();
    return current;
  }

  if (event.kind === "text") {
    const activeRevision = revisionStack[revisionStack.length - 1];
    if (!activeRevision || activeRevision === "ins") {
      current.runs.push(formattedRunForTextEvent(snapshot, event));
    }
    return current;
  }

  if (event.kind === "elementEnd" && event.name === "w:p") {
    if (current.hasRevision) {
      result.set(current.path, {
        markdownText: projectFormattedRunsToMarkdown(current.runs).markdownText,
        xmlStart: current.xmlStart,
      });
    }
    return undefined;
  }

  return current;
}

async function projectSemanticRevisionParagraphsFromEventsAsync(
  snapshot: OoxmlPackageSnapshot,
  events: readonly OoxmlEvent[] | undefined,
  options: {
    yieldToHost: () => Promise<void>;
    trace?: (detail: Record<string, unknown>) => void;
  }
): Promise<ReadonlyMap<string, SemanticParagraphProjection>> {
  const result = new Map<string, SemanticParagraphProjection>();
  if (!events) return result;
  try {
    let current:
      | { path: string; xmlStart: number; runs: FormattedRun[]; hasRevision: boolean }
      | undefined;
    const revisionStack: Array<"ins" | "del"> = [];

    for (let index = 0; index < events.length; index += 1) {
      if (index > 0 && index % 2_000 === 0) {
        options.trace?.({
          stage: "event-progress",
          eventIndex: index,
          eventCount: events.length,
          semanticParagraphCount: result.size,
          activeRevisionDepth: revisionStack.length,
        });
        await options.yieldToHost();
      }
      current = updateSemanticParagraphState(
        snapshot,
        result,
        revisionStack,
        current,
        events[index]!
      );
    }
    options.trace?.({
      stage: "event-done",
      eventCount: events.length,
      semanticParagraphCount: result.size,
    });
    await options.yieldToHost();
  } catch {
    return result;
  }
  return result;
}


function formattedRunForTextEvent(
  snapshot: OoxmlPackageSnapshot,
  event: Extract<OoxmlEvent, { kind: "text" }>
): FormattedRun {
  const hyperlinkRelationshipId = event.runStyle.hyperlinkRelationshipId;
  return {
    text: event.text,
    ...(event.runStyle.bold ? { bold: true } : undefined),
    ...(event.runStyle.italic ? { italic: true } : undefined),
    ...(event.runStyle.strikethrough ? { strikethrough: true } : undefined),
    ...(event.runStyle.underline ? { underline: true } : undefined),
    ...(event.runStyle.code ? { code: true } : undefined),
    ...(hyperlinkRelationshipId
      ? {
          hyperlink:
            relationshipTarget(snapshot, event.partName, hyperlinkRelationshipId) ??
            hyperlinkRelationshipId,
        }
      : undefined),
  };
}

function relationshipTarget(
  snapshot: OoxmlPackageSnapshot,
  partName: string,
  relationshipId: string
): string | undefined {
  return snapshot.relationships.byPart.get(partName)?.relationships.get(relationshipId)?.target;
}

function firstRegionXmlStart(region: OoxmlRegionProjection): number {
  return Math.min(
    ...region.tokens.map((token) => token.xmlStart ?? Number.MAX_SAFE_INTEGER),
    Number.MAX_SAFE_INTEGER
  );
}

function isRegionInsideTable(region: OoxmlRegionProjection): boolean {
  return /\/w:tbl\[/.test(region.containerPath) ||
    /\/w:tbl\[/.test(region.handle.path);
}

interface ParagraphAnchorState {
  readonly lineNumber: number;
  cursor?: number;
}

function anchorRevisionRecords(
  records: readonly ChangeDownRecord[],
  bodyMarkdown: string,
  lineByContainerPath: ReadonlyMap<string, number> = new Map()
): ChangeDownRecord[] {
  const paragraphAnchors = new Map<string, ParagraphAnchorState>();
  const paragraphLineNumbers = paragraphLineNumbersForRecords(
    records,
    bodyMarkdown.split("\n"),
    lineByContainerPath
  );
  return records.map((record, index) => {
    const paragraphKey = paragraphKeyForRecord(record);
    const prior = paragraphKey
      ? paragraphAnchors.get(paragraphKey) ??
        (paragraphLineNumbers.has(paragraphKey)
          ? { lineNumber: paragraphLineNumbers.get(paragraphKey)! }
          : undefined)
      : undefined;
    const anchored = anchorRevisionRecord(record, index + 2, bodyMarkdown, prior);
    if (paragraphKey && anchored.nextState) {
      paragraphAnchors.set(paragraphKey, anchored.nextState);
    }
    return {
      ...record,
      id: `cn-${index + 2}`,
      bodyLines: anchored.bodyLines,
    };
  });
}

function paragraphLineNumbersForRecords(
  records: readonly ChangeDownRecord[],
  lines: readonly string[],
  lineByContainerPath: ReadonlyMap<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const record of records) {
    const paragraphKey = paragraphKeyForRecord(record);
    if (!paragraphKey || result.has(paragraphKey)) continue;
    const knownLine = lineByContainerPath.get(paragraphKey);
    if (knownLine !== undefined) {
      result.set(paragraphKey, knownLine);
      continue;
    }
    const candidates = records
      .filter((candidate) => paragraphKeyForRecord(candidate) === paragraphKey)
      .sort((left, right) => {
        const leftDeletion = left.type === "del" ? 1 : 0;
        const rightDeletion = right.type === "del" ? 1 : 0;
        return leftDeletion - rightDeletion;
      });
    for (const candidate of candidates) {
      if (paragraphKeyForRecord(candidate) !== paragraphKey) continue;
      const lineNumber = findLineContainingText(
        lines,
        candidate.bodyLines.join("\n")
      );
      if (lineNumber !== undefined) {
        result.set(paragraphKey, lineNumber);
        break;
      }
    }
  }
  return result;
}

function editOpLinesForRevisionRecord(
  record: ChangeDownRecord,
  bodyMarkdown: string,
  prior?: ParagraphAnchorState
): readonly string[] {
  const text = record.bodyLines.join("\n");
  if (!text) {
    return [];
  }
  const lines = bodyMarkdown.split("\n");
  const located = locateRevisionOnBodyLine({
    record,
    text,
    lines,
    bodyMarkdown,
    prior,
  });
  const lineNumber = located.lineNumber;
  const line = lines[lineNumber - 1] ?? "";
  const hash = computeLineHash(lineNumber - 1, line, lines);
  const column = located.column;
  const changeType =
    record.type === "del" ? ChangeType.Deletion : ChangeType.Insertion;
  const contextualEditOpLine = buildContextualL3EditOp({
      changeType,
      originalText: record.type === "del" ? text : "",
      currentText: record.type === "del" ? "" : text,
      lineContent: line,
      lineNumber,
      hash,
      column,
      anchorLen: record.type === "del" ? 0 : text.length,
    }).replace(/^ {4}/u, "");
  return [contextualEditOpLine];
}

function anchorRevisionRecord(
  record: ChangeDownRecord,
  _idNumber: number,
  bodyMarkdown: string,
  prior?: ParagraphAnchorState
): { bodyLines: readonly string[]; nextState?: ParagraphAnchorState } {
  const text = record.bodyLines.join("\n");
  const bodyLines = editOpLinesForRevisionRecord(record, bodyMarkdown, prior);
  if (!text) return { bodyLines };
  const lines = bodyMarkdown.split("\n");
  const located = locateRevisionOnBodyLine({
    record,
    text,
    lines,
    bodyMarkdown,
    prior,
  });
  const nextCursor =
    record.type === "del"
      ? located.column
      : Math.max(located.column, located.column + text.length);
  return {
    bodyLines,
    nextState: {
      lineNumber: located.lineNumber,
      cursor: nextCursor,
    },
  };
}

function paragraphKeyForRecord(record: ChangeDownRecord): string | undefined {
  const path = record.metadata["ooxml-path"];
  return path?.match(/^(.*\/w:p\[\d+\])/u)?.[1];
}

function locateRevisionOnBodyLine(input: {
  record: ChangeDownRecord;
  text: string;
  lines: readonly string[];
  bodyMarkdown: string;
  prior?: ParagraphAnchorState;
}): { lineNumber: number; column: number } {
  const { record, text, lines, bodyMarkdown, prior } = input;
  const fallbackLineNumber = lineNumberForOffset(
    bodyMarkdown,
    Number(record.metadata["body-start"] ?? 0)
  );
  const candidateLineNumber = prior?.lineNumber ?? findLineContainingText(lines, text) ?? fallbackLineNumber;
  const lineNumber = Math.max(1, Math.min(candidateLineNumber, lines.length || 1));
  const line = lines[lineNumber - 1] ?? "";
  if (record.type === "del") {
    return {
      lineNumber,
      column: Math.max(0, Math.min(columnHintForRecord(record, line.length) ?? prior?.cursor ?? 0, line.length)),
    };
  }
  const cursor = Math.max(0, Math.min(columnHintForRecord(record, line.length) ?? prior?.cursor ?? 0, line.length));
  const atOrAfterCursor = text ? line.indexOf(text, cursor) : -1;
  const first = text ? line.indexOf(text) : -1;
  const column =
    atOrAfterCursor >= 0
      ? atOrAfterCursor
      : first >= 0
        ? first
        : Math.max(0, Math.min(cursor, line.length));
  return { lineNumber, column };
}

function columnHintForRecord(
  record: ChangeDownRecord,
  lineLength: number
): number | undefined {
  const raw = record.metadata["paragraph-column"];
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(parsed, lineLength));
}

function findLineContainingText(
  lines: readonly string[],
  text: string
): number | undefined {
  if (!text) return undefined;
  const matches: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]!.includes(text)) matches.push(index + 1);
  }
  return matches[0];
}

function lineNumberForOffset(text: string, offset: number): number {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
}

function offsetForLineNumber(text: string, lineNumber: number): number {
  if (lineNumber <= 1) return 0;
  const lines = text.split("\n");
  let offset = 0;
  for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
    offset += lines[index]!.length + 1;
  }
  return offset;
}

function buildCodecGenesisRecord(
  bodyMarkdown: string,
  snapshot: OoxmlPackageSnapshot
): ChangeDownRecord {
  return {
    id: "cn-1",
    author: "@base-document",
    date: codecRecordDate(snapshot),
    type: "ins",
    status: "accepted",
    reviewable: false,
    metadata: {
      source: "initial-word-body",
      scope: "document",
      "body-hash": stableSourceHash(bodyMarkdown),
    },
    bodyLines: bodyMarkdown ? bodyMarkdown.split("\n") : [],
  };
}

function serializeChangeDownSource(input: {
  readonly bodyMarkdown: string;
  readonly records: readonly ChangeDownRecord[];
}): string {
  const body = input.bodyMarkdown.trimEnd();
  const serializedRecords = input.records
    .map((record) => serializeChangeDownRecord(record))
    .join("\n\n");

  if (!body) {
    return serializedRecords ? `${serializedRecords}\n` : "";
  }
  return serializedRecords ? `${body}\n\n${serializedRecords}\n` : `${body}\n`;
}

function serializeChangeDownRecord(record: ChangeDownRecord): string {
  const lines = [
    `[^${record.id}]: ${record.author} | ${record.date} | ${record.type} | ${record.status}`,
  ];
  for (const [key, value] of Object.entries(record.metadata)) {
    lines.push(`    ${key}: ${value}`);
  }
  if (record.reviewable) {
    for (const bodyLine of record.bodyLines) {
      lines.push(`    ${bodyLine}`);
    }
  }
  return lines.join("\n");
}

function codecRecordDate(snapshot: OoxmlPackageSnapshot): string {
  return /^\d{4}-\d{2}-\d{2}/.test(snapshot.freshnessVersion)
    ? snapshot.freshnessVersion.slice(0, 10)
    : "2026-05-04";
}

function buildPackageLedger(snapshot: OoxmlPackageSnapshot): PackageLedger {
  const includedPartNames = [...snapshot.hashes.keys()].sort();
  return {
    source: snapshot.source,
    documentPartName: snapshot.documentPartName,
    hashCoverage: snapshot.capabilities.canPreserveUntouchedParts
      ? "complete"
      : "partial",
    includedPartNames,
    partHashes: Object.fromEntries(snapshot.hashes.entries()),
  };
}

function stableSourceHash(value: string): string {
  return stableHash(value, 8);
}

function stableHash(value: string, width: number): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(width, "0").slice(0, width);
}
