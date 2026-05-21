import {
  signatureForSourceGroup,
  type PublicChangeEntry,
  type RowIdentityRegistry,
} from '@changedown/core';
import type { OoxmlSourceRevisionGroup, SourceLedgerArtifactGroup } from '../index.js';
import { renderBodyClauseForSourceGroup } from './body-vocabulary.js';

export interface PublicEntriesFromOoxmlSourceGroupsInput {
  groups: readonly OoxmlSourceRevisionGroup[];
  artifacts?: readonly SourceLedgerArtifactGroup[];
  registry: RowIdentityRegistry;
}

export function publicEntriesFromOoxmlSourceGroups(input: PublicEntriesFromOoxmlSourceGroupsInput): PublicChangeEntry[] {
  const artifactByGroup = new Map((input.artifacts ?? []).map((artifact) => [artifact.groupId, artifact]));
  const groups = [...input.groups].sort(compareSourceGroupsForPublicIdentity);
  return groups.map((group) => {
    const changeId = input.registry.getOrAssign(signatureForSourceGroup({
      id: group.id,
      atomIds: group.atomIds,
      partName: group.partName,
      path: group.path,
      kind: group.kind,
      author: group.author,
      date: group.date,
      textHash: group.textPreview ?? group.propertySummary ?? '',
    }));
    const artifact = artifactByGroup.get(group.id);
    const rendered = renderBodyClauseForSourceGroup({ changeId, group, artifact });
    return {
      id: changeId,
      kind: publicKindForSourceGroup(group),
      status: 'proposed',
      representation: rendered.representation,
      anchors: [{ kind: rendered.representation === 'metadata-anchor' ? 'paragraph' : 'inline-range', marker: `[^${changeId}]` }],
      actionability: defaultActionabilityForSourceGroup(group),
      ...(group.author ? { author: group.author } : {}),
      ...(group.date ? { date: group.date.slice(0, 10) } : {}),
      protocolMetadata: {
        ...rendered.metadata,
        sourceGroupId: group.id,
        partName: group.partName,
        confidence: group.confidence,
        atomIds: group.atomIds.join(' '),
        nativeRevisionIds: group.nativeRevisionIds.join(' '),
        diagnostics: group.diagnostics.join(' | '),
      },
    };
  });
}

function compareSourceGroupsForPublicIdentity(left: OoxmlSourceRevisionGroup, right: OoxmlSourceRevisionGroup): number {
  if (left.partName !== right.partName) return left.partName.localeCompare(right.partName);
  return (left.xmlStart ?? Number.MAX_SAFE_INTEGER) - (right.xmlStart ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
}

function publicKindForSourceGroup(group: OoxmlSourceRevisionGroup): PublicChangeEntry['kind'] {
  switch (group.kind) {
    case 'insertion': return 'ins';
    case 'deletion': return 'del';
    case 'move': return 'move';
    case 'comment': return 'comment';
    case 'formatting':
    case 'run-property':
    case 'paragraph-property':
    case 'table-property':
    case 'row-property':
    case 'cell-property':
      return 'format';
    default: return 'metadata';
  }
}

function defaultActionabilityForSourceGroup(group: OoxmlSourceRevisionGroup): PublicChangeEntry['actionability'] {
  if (group.diagnostics.length > 0) return { state: 'diagnostic-only', reason: group.diagnostics.join(' | ') };
  switch (group.kind) {
    case 'insertion':
    case 'deletion':
    case 'formatting':
      return { state: 'protocol-ready' };
    case 'comment':
      return { state: 'blocked', reason: 'comment-action-plan-not-built' };
    case 'move':
      return { state: 'blocked', reason: 'compound-action-plan-not-built' };
    case 'run-property':
    case 'paragraph-property':
    case 'table-property':
    case 'row-property':
    case 'cell-property':
      return { state: 'blocked', reason: 'metadata-only-v1' };
    default:
      return { state: 'diagnostic-only', reason: `unsupported-source-group-kind:${group.kind}` };
  }
}
