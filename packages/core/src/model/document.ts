import { ChangeNode, ChangeStatus, ChangeType, OffsetRange, PendingOverlay } from './types.js';

export class VirtualDocument {
  private changes: ChangeNode[];

  constructor(changes: ChangeNode[] = []) {
    this.changes = changes;
  }

  /**
   * Create a VirtualDocument from a pending overlay only (no parse).
   * Used when LSP is disconnected and overlay exists — enables display of
   * pending insertion before LSP connects.
   */
  static fromOverlayOnly(overlay: PendingOverlay): VirtualDocument {
    const change: ChangeNode = {
      id: overlay.scId ?? `ct-pending-${overlay.range.start}`,
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: overlay.range,
      contentRange: overlay.range,
      modifiedText: overlay.text,
      level: 1,
      anchored: false,
    };
    return new VirtualDocument([change]);
  }

  getChanges(): ChangeNode[] {
    return this.changes;
  }

  changeAtOffset(offset: number): ChangeNode | null {
    for (const change of this.changes) {
      if (offset >= change.range.start && offset <= change.range.end) {
        return change;
      }
    }
    return null;
  }

  acceptChange(id: string): void {
    const change = this.changes.find(c => c.id === id);
    if (change) {
      change.status = ChangeStatus.Accepted;
    }
  }

  rejectChange(id: string): void {
    const change = this.changes.find(c => c.id === id);
    if (change) {
      change.status = ChangeStatus.Rejected;
    }
  }

  /**
   * Returns all changes belonging to a given group (e.g., a move operation).
   * Changes are identified by their groupId field.
   */
  getGroupMembers(groupId: string): ChangeNode[] {
    return this.changes.filter(c => c.groupId === groupId);
  }
}
