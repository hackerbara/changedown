import { computeLineHash } from "@changedown/core";
import { applyOoxmlRegionPatchAsync } from "./patch.js";
import { streamOoxmlPartEvents } from "./events.js";
import { projectOoxmlRegions } from "./region.js";
import { projectOoxmlRevisionsToCurrentBody } from "./revisions.js";
import type { ChangeDownRecord } from "./revisions.js";
import { collectOoxmlRevisionWitnesses } from "./revision-witness.js";
import type { OoxmlRevisionWitness } from "./revision-witness.js";
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

export interface CodecDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error";
}

export interface PackageLedger {
  readonly source: OoxmlPackageSnapshot["source"];
  readonly documentPartName: string;
  readonly partHashes: Readonly<Record<string, string>>;
}

export interface CodecProjection {
  readonly source: string;
  readonly bodyMarkdown: string;
  readonly records: readonly ChangeDownRecord[];
  readonly regions: readonly OoxmlRegionProjection[];
  readonly tokens: readonly OoxmlToken[];
  readonly revisionWitnesses: readonly OoxmlRevisionWitness[];
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
      const regions = projectOoxmlRegions(input.snapshot);
      const tables = projectOoxmlTables(input.snapshot);
      const revisionProjection = projectRevisionProjection(input.snapshot);
      const revisionWitnesses = collectOoxmlRevisionWitnesses(input.snapshot);
      const bodyRegions = regions.filter((region) => !isRegionInsideTable(region));
      const semanticParagraphs = projectSemanticRevisionParagraphs(input.snapshot);
      const bodyMarkdown = assembleBodyMarkdown(bodyRegions, tables, semanticParagraphs);
      const revisionRecords = revisionProjection.records;
      const records = [
        buildCodecGenesisRecord(bodyMarkdown, input.snapshot),
        ...revisionRecords.map((record, index) =>
          anchorRevisionRecord(record, index + 2, bodyMarkdown)
        ),
      ];

      return {
        snapshot: input.snapshot,
        source: serializeChangeDownSource({ bodyMarkdown, records }),
        bodyMarkdown,
        records,
        regions,
        tables,
        tokens: bodyRegions
          .filter((region) => !semanticParagraphs.has(region.containerPath))
          .flatMap((region) => region.tokens),
        revisionWitnesses,
        packageLedger: buildPackageLedger(input.snapshot),
        diagnostics: [],
      };
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

function assertFullPackageMutation(snapshot: OoxmlPackageSnapshot): void {
  if (
    snapshot.source !== "full-package" ||
    !snapshot.capabilities.hasFullPackage ||
    !snapshot.capabilities.canPreserveUntouchedParts
  ) {
    throw new Error(
      "OOXML package codec requires full-package evidence for mutation"
    );
  }
}

function projectRevisionProjection(snapshot: OoxmlPackageSnapshot): {
  readonly body: string;
  readonly records: readonly ChangeDownRecord[];
} {
  try {
    const events = streamOoxmlPartEvents(snapshot, snapshot.documentPartName, {
      revisions: "semantic",
    });
    return projectOoxmlRevisionsToCurrentBody(events);
  } catch {
    return { body: "", records: [] };
  }
}

function assembleBodyMarkdown(
  regions: readonly OoxmlRegionProjection[],
  tables: readonly OoxmlTableProjection[],
  semanticParagraphs: ReadonlyMap<string, SemanticParagraphProjection>
): string {
  return [
    ...regions.map((region) => {
      const semantic = semanticParagraphs.get(region.containerPath);
      return {
        markdownText: semantic?.markdownText ?? region.markdownText,
        xmlStart: semantic?.xmlStart ?? firstRegionXmlStart(region),
      };
    }),
    ...tables.map((table) => ({
      markdownText: table.markdownText,
      xmlStart: table.xmlStart,
    })),
  ]
    .filter((block) => block.markdownText.length > 0)
    .sort((left, right) => left.xmlStart - right.xmlStart)
    .map((block) => block.markdownText)
    .join("\n\n");
}

interface SemanticParagraphProjection {
  readonly markdownText: string;
  readonly xmlStart: number;
}

function projectSemanticRevisionParagraphs(
  snapshot: OoxmlPackageSnapshot
): ReadonlyMap<string, SemanticParagraphProjection> {
  const result = new Map<string, SemanticParagraphProjection>();
  try {
    const events = streamOoxmlPartEvents(snapshot, snapshot.documentPartName, {
      revisions: "semantic",
    });
    let current:
      | { path: string; xmlStart: number; text: string; hasRevision: boolean }
      | undefined;
    const revisionStack: Array<"ins" | "del"> = [];

    for (const event of events) {
      if (event.kind === "elementStart" && event.name === "w:p") {
        current = {
          path: event.path,
          xmlStart: event.xmlStart ?? Number.MAX_SAFE_INTEGER,
          text: "",
          hasRevision: false,
        };
        continue;
      }

      if (!current) {
        continue;
      }

      if (event.kind === "revisionStart") {
        revisionStack.push(event.type);
        current.hasRevision = true;
        continue;
      }

      if (event.kind === "revisionEnd") {
        revisionStack.pop();
        continue;
      }

      if (event.kind === "text") {
        const activeRevision = revisionStack[revisionStack.length - 1];
        if (!activeRevision || activeRevision === "ins") {
          current.text += event.text;
        }
        continue;
      }

      if (event.kind === "elementEnd" && event.name === "w:p") {
        if (current.hasRevision) {
          result.set(current.path, {
            markdownText: current.text,
            xmlStart: current.xmlStart,
          });
        }
        current = undefined;
      }
    }
  } catch {
    return result;
  }
  return result;
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

function anchorRevisionRecord(
  record: ChangeDownRecord,
  idNumber: number,
  bodyMarkdown: string
): ChangeDownRecord {
  return {
    ...record,
    id: `cn-${idNumber}`,
    bodyLines: editOpLinesForRevisionRecord(record, bodyMarkdown),
  };
}

function editOpLinesForRevisionRecord(
  record: ChangeDownRecord,
  bodyMarkdown: string
): readonly string[] {
  const text = record.bodyLines.join("\n");
  if (!text) {
    return [];
  }
  const lineNumber = lineNumberForOffset(
    bodyMarkdown,
    Number(record.metadata["body-start"] ?? 0)
  );
  const line = bodyMarkdown.split("\n")[lineNumber - 1] ?? "";
  const hash = computeLineHash(lineNumber - 1, line, bodyMarkdown.split("\n"));
  const op = record.type === "del" ? `{--${text}--}` : `{++${text}++}`;
  return [`${lineNumber}:${hash} ${op}`];
}

function lineNumberForOffset(text: string, offset: number): number {
  return text.slice(0, Math.max(0, offset)).split("\n").length;
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
  return {
    source: snapshot.source,
    documentPartName: snapshot.documentPartName,
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
