import type { PublicChangeRepresentation } from '@changedown/core';
import type { OoxmlSourceRevisionGroup, SourceLedgerArtifactGroup } from '../index.js';

export interface RenderBodyClauseInput {
  changeId: `cn-${number}`;
  group: OoxmlSourceRevisionGroup;
  artifact?: SourceLedgerArtifactGroup;
}

export interface RenderBodyClauseResult {
  body: string;
  representation: PublicChangeRepresentation;
  metadata: Record<string, string>;
}

export function renderBodyClauseForSourceGroup(input: RenderBodyClauseInput): RenderBodyClauseResult {
  const marker = `[^${input.changeId}]`;
  const textPreview = input.group.textPreview || input.artifact?.canonicalMarkdownPreview || input.group.propertySummary || input.group.id;
  switch (input.group.kind) {
    case 'insertion':
      return { body: `{++${textPreview}++}${marker}`, representation: 'inline-markup', metadata: {} };
    case 'deletion':
      return { body: `{--${textPreview}--}${marker}`, representation: 'inline-markup', metadata: {} };
    case 'formatting': {
      const property = input.group.propertySummary ?? input.artifact?.formattingRuns[0]?.summary ?? 'formatting';
      const rendered = input.artifact?.canonicalMarkdownPreview ?? textPreview;
      if (rendered !== textPreview && rendered.length > 0) {
        return { body: `{~~${textPreview}~>${rendered}~~}${marker}`, representation: 'rendered-substitution', metadata: { property } };
      }
      return { body: `${textPreview}${marker}`, representation: 'metadata-anchor', metadata: { property } };
    }
    case 'run-property':
    case 'paragraph-property':
    case 'table-property':
    case 'row-property':
    case 'cell-property':
      return { body: `${input.artifact?.canonicalMarkdownPreview || textPreview}${marker}`, representation: 'metadata-anchor', metadata: { property: input.group.propertySummary ?? input.group.kind } };
    case 'move':
      return { body: `${textPreview}${marker}`, representation: 'compound-parent', metadata: { property: 'move' } };
    case 'comment':
      return { body: `${textPreview}${marker}`, representation: 'comment-thread', metadata: { property: 'comment' } };
    default:
      return { body: `${textPreview}${marker}`, representation: 'metadata-anchor', metadata: { property: input.group.kind } };
  }
}
