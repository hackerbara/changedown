import { ChangeNode, ChangeStatus, ChangeType, isGhostNode, OffsetRange, PendingOverlay, UnresolvedDiagnostic } from './types.js';

export class VirtualDocument {
  private changes: ChangeNode[];
  readonly coherenceRate: number;
  readonly unresolvedDiagnostics: UnresolvedDiagnostic[];
  readonly resolvedText?: string;

  constructor(
    changes: ChangeNode[] = [],
    coherenceRate: number = 100,
    unresolvedDiagnostics: UnresolvedDiagnostic[] = [],
    resolvedText?: string,
  ) {
    this.changes = changes;
    this.coherenceRate = coherenceRate;
    this.unresolvedDiagnostics = unresolvedDiagnostics;
    this.resolvedText = resolvedText;
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

  /** Returns L2+ ghost nodes that failed anchor resolution. L0/L1 unanchored nodes are excluded. */
  getUnresolvedChanges(): ChangeNode[] {
    return this.changes.filter(c => isGhostNode(c));
  }

  changeAtOffset(offset: number): ChangeNode | null {
    for (const change of this.changes) {
      if (change.range.start === change.range.end
          ? offset === change.range.start
          : offset >= change.range.start && offset < change.range.end) {
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
