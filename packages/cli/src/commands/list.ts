import { CriticMarkupParser, ChangeType, ChangeStatus } from '@changetracks/core';

export interface ChangeListEntry {
  change_id: string;
  type: string;
  status: string;
  author: string;
  line: number;
  preview: string;
}

const TYPE_LABELS: Record<string, string> = {
  [ChangeType.Insertion]: 'ins',
  [ChangeType.Deletion]: 'del',
  [ChangeType.Substitution]: 'sub',
  [ChangeType.Highlight]: 'highlight',
  [ChangeType.Comment]: 'comment',
};

const STATUS_LABELS: Record<string, string> = {
  [ChangeStatus.Proposed]: 'proposed',
  [ChangeStatus.Accepted]: 'accepted',
  [ChangeStatus.Rejected]: 'rejected',
};

/**
 * Computes a list of all tracked changes in a CriticMarkup document.
 * Pure function: no I/O, no side effects.
 *
 * @param content - The full document text
 * @param statusFilter - If provided, only return changes with this status ('proposed', 'accepted', 'rejected')
 */
export function computeChangeList(content: string, statusFilter?: string): ChangeListEntry[] {
  const parser = new CriticMarkupParser();
  const doc = parser.parse(content, { skipCodeBlocks: false });
  const changes = doc.getChanges();

  const entries: ChangeListEntry[] = [];

  for (const change of changes) {
    const statusLabel = STATUS_LABELS[change.status] ?? 'proposed';

    if (statusFilter && statusLabel !== statusFilter) {
      continue;
    }

    // Compute 1-indexed line number from the character offset
    const textBefore = content.slice(0, change.range.start);
    const line = textBefore.split('\n').length;

    // Build a preview from the change content (first 60 chars)
    let previewText = '';
    if (change.type === ChangeType.Substitution) {
      previewText = `${change.originalText ?? ''}~>${change.modifiedText ?? ''}`;
    } else if (change.type === ChangeType.Insertion) {
      previewText = change.modifiedText ?? '';
    } else {
      previewText = change.originalText ?? '';
    }
    const preview = previewText.length > 60 ? previewText.slice(0, 60) + '...' : previewText;

    entries.push({
      change_id: change.id,
      type: TYPE_LABELS[change.type] ?? change.type,
      status: statusLabel,
      author: change.metadata?.author ?? '',
      line,
      preview,
    });
  }

  return entries;
}
