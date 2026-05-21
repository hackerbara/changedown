import type { OoxmlEvent } from "./index.js";
import { projectFormattedRunsToMarkdown, type FormattedRun } from "../inline-codec/index.js";

export interface ChangeDownRecord {
  readonly id: string;
  readonly author: string;
  readonly date: string;
  readonly type: string;
  readonly status: string;
  readonly reviewable: boolean;
  readonly metadata: Readonly<Record<string, string>>;
  readonly bodyLines: readonly string[];
}

export interface OoxmlProjectedRevision {
  readonly type: "ins" | "del";
  readonly text: string;
  readonly bodyStart: number;
  readonly bodyEnd: number;
  readonly paragraphPath?: string;
  readonly paragraphColumn?: number;
  readonly nativeRevisionTag?: string;
  readonly nativeRevisionId?: string;
  readonly partName?: string;
  readonly path?: string;
  readonly xmlStart?: number;
  readonly xmlEnd?: number;
  readonly author?: string;
  readonly date?: string;
}

export interface OoxmlRevisionProjection {
  readonly body: string;
  readonly revisions: readonly OoxmlProjectedRevision[];
  readonly records: readonly ChangeDownRecord[];
}

interface ActiveRevision {
  type: "ins" | "del";
  author?: string;
  date?: string;
  nativeRevisionTag?: string;
  nativeRevisionId?: string;
  partName?: string;
  path?: string;
  xmlStart?: number;
  xmlEnd?: number;
  start: number;
  paragraphPath?: string;
  paragraphColumn?: number;
  text: string;
  runs: FormattedRun[];
}

export interface OoxmlRevisionProjectionContext {
  relationshipTarget?: (partName: string, relationshipId: string) => string | undefined;
}

export function projectOoxmlRevisionsToCurrentBody(
  events: readonly OoxmlEvent[],
  context: OoxmlRevisionProjectionContext = {}
): OoxmlRevisionProjection {
  let body = "";
  const stack: ActiveRevision[] = [];
  const revisions: OoxmlProjectedRevision[] = [];
  let activeParagraph:
    | { path: string; bodyStart: number; runs: FormattedRun[] }
    | undefined;

  for (const event of events) {
    if (event.kind === "elementStart" && isParagraphElement(event.name)) {
      activeParagraph = { path: event.path, bodyStart: body.length, runs: [] };
      continue;
    }

    if (event.kind === "revisionStart") {
      stack.push({
        type: event.type,
        author: event.author,
        date: event.date,
        nativeRevisionTag: event.nativeRevisionTag,
        nativeRevisionId: event.nativeRevisionId,
        partName: event.partName,
        path: event.path,
        xmlStart: event.xmlStart,
        xmlEnd: event.xmlEnd,
        start: body.length,
        paragraphPath: activeParagraph?.path,
        paragraphColumn:
          activeParagraph !== undefined
            ? projectFormattedRunsToMarkdown(activeParagraph.runs).markdownText.length
            : undefined,
        text: "",
        runs: [],
      });
      continue;
    }

    if (event.kind === "text") {
      const active = stack[stack.length - 1];
      if (active) {
        active.text += event.text;
        active.runs.push(formattedRunForTextEvent(event, context));
      }
      if (!active || active.type === "ins") {
        body += event.text;
        activeParagraph?.runs.push(formattedRunForTextEvent(event, context));
      }
      continue;
    }

    if (event.kind === "revisionEnd") {
      const active = stack.pop();
      if (!active) {
        continue;
      }
      const markdownText = markdownForRevision(active);
      revisions.push({
        type: active.type,
        text: markdownText,
        bodyStart: active.start,
        bodyEnd:
          active.type === "ins"
            ? active.start + active.text.length
            : active.start,
        paragraphPath: active.paragraphPath,
        paragraphColumn: active.paragraphColumn,
        author: active.author,
        date: active.date,
        nativeRevisionTag: active.nativeRevisionTag,
        nativeRevisionId: active.nativeRevisionId,
        partName: active.partName,
        path: active.path,
        xmlStart: active.xmlStart,
        xmlEnd: active.xmlEnd,
      });
    }

    if (event.kind === "elementEnd" && isParagraphElement(event.name)) {
      activeParagraph = undefined;
      continue;
    }
  }

  const reviewableRevisions = revisions.filter((revision) =>
    revision.text.trim().length > 0
  );

  return {
    body,
    revisions,
    records: reviewableRevisions.map((revision, index) =>
      revisionToRecord(revision, index)
    ),
  };
}

function markdownForRevision(revision: ActiveRevision): string {
  if (revision.runs.length === 0) return revision.text;
  return projectFormattedRunsToMarkdown(revision.runs).markdownText;
}

function formattedRunForTextEvent(
  event: Extract<OoxmlEvent, { kind: "text" }>,
  context: OoxmlRevisionProjectionContext
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
            context.relationshipTarget?.(event.partName, hyperlinkRelationshipId) ??
            hyperlinkRelationshipId,
        }
      : undefined),
  };
}

function revisionToRecord(
  revision: OoxmlProjectedRevision,
  index: number
): ChangeDownRecord {
  return {
    id: `cn-${index + 1}`,
    author: normalizeAuthor(revision.author),
    date: revision.date ?? "undated",
    type: revision.type,
    status: "proposed",
    reviewable: true,
    metadata: {
      source: "semantic-word-revision",
      "body-start": String(revision.bodyStart),
      "body-end": String(revision.bodyEnd),
      ...(revision.paragraphPath
        ? { "paragraph-path": revision.paragraphPath }
        : {}),
      ...(revision.paragraphColumn !== undefined
        ? { "paragraph-column": String(revision.paragraphColumn) }
        : {}),
      ...(revision.nativeRevisionTag
        ? { "native-revision-tag": revision.nativeRevisionTag }
        : {}),
      ...(revision.nativeRevisionId
        ? { "native-revision-id": revision.nativeRevisionId }
        : {}),
      ...(revision.partName ? { "part-name": revision.partName } : {}),
      ...(revision.path ? { "ooxml-path": revision.path } : {}),
      ...(revision.xmlStart !== undefined
        ? { "xml-start": String(revision.xmlStart) }
        : {}),
      ...(revision.xmlEnd !== undefined
        ? { "xml-end": String(revision.xmlEnd) }
        : {}),
    },
    bodyLines: revision.text ? [revision.text] : [],
  };
}

function isParagraphElement(name: string): boolean {
  return name === "w:p" || name === "p" || name.endsWith(":p");
}

function normalizeAuthor(author: string | undefined): string {
  if (!author) {
    return "@unknown";
  }
  return author.startsWith("@") ? author : `@${author}`;
}
