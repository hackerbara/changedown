import {
  assertProtocolDocumentInvariants,
  buildChangeDownProtocolDocument,
  buildPublicChangeIndex,
  type ChangeDownProtocolDocument,
  type ProtocolInvariantResult,
  type PublicChangeIndex,
  type RowIdentityRegistry,
} from '@changedown/core';
import type { CodecProjection, OoxmlSourceRevisionGroup, SourceLedgerArtifact } from '../index.js';
import { publicEntriesFromOoxmlSourceGroups } from './provider-adapters.js';
import { renderBodyClauseForSourceGroup } from './body-vocabulary.js';

export interface CodecDocument {
  packageGraph: { source: 'ooxml-projection'; tokenCount: number; regionCount: number };
  sourceGraph: { groups: readonly OoxmlSourceRevisionGroup[]; artifact: SourceLedgerArtifact };
  reviewGraph: { publicEntryCount: number };
  protocol: ChangeDownProtocolDocument;
  projectionSet: { bodyMarkdown: string; source: string };
  validationState: { protocolInvariant: ProtocolInvariantResult; diagnostics: readonly unknown[] };
  publicIndex: PublicChangeIndex;
}

export interface BuildCodecDocumentFromOoxmlProjectionInput {
  projection: CodecProjection;
  registry: RowIdentityRegistry;
}

export function buildCodecDocumentFromOoxmlProjection(input: BuildCodecDocumentFromOoxmlProjectionInput): CodecDocument {
  const entries = publicEntriesFromOoxmlSourceGroups({
    groups: input.projection.revisionGroups,
    artifacts: input.projection.sourceLedgerArtifact.groups,
    registry: input.registry,
  });
  const artifactByGroup = new Map(input.projection.sourceLedgerArtifact.groups.map((artifact) => [artifact.groupId, artifact]));
  const groupById = new Map(input.projection.revisionGroups.map((group) => [group.id, group]));
  const body = entries
    .map((entry) => {
      const groupId = entry.protocolMetadata.sourceGroupId;
      const group = groupById.get(groupId);
      if (!group) throw new Error(`ProtocolProviderInvariantViolation: missing source group ${groupId}`);
      return renderBodyClauseForSourceGroup({
        changeId: entry.id,
        group,
        artifact: artifactByGroup.get(group.id),
      }).body;
    })
    .join('\n\n');
  const protocol = buildChangeDownProtocolDocument({ backendKind: 'word-ooxml', body, entries });
  const protocolInvariant = assertProtocolDocumentInvariants(protocol);
  return {
    packageGraph: { source: 'ooxml-projection', tokenCount: input.projection.tokens.length, regionCount: input.projection.regions.length },
    sourceGraph: { groups: input.projection.revisionGroups, artifact: input.projection.sourceLedgerArtifact },
    reviewGraph: { publicEntryCount: entries.length },
    protocol,
    projectionSet: { bodyMarkdown: body, source: protocol.source },
    validationState: { protocolInvariant, diagnostics: input.projection.diagnostics },
    publicIndex: buildPublicChangeIndex(protocol),
  };
}
