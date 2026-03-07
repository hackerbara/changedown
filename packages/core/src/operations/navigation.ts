import { ChangeNode } from '../model/types.js';
import { VirtualDocument } from '../model/document.js';

export function nextChange(doc: VirtualDocument, cursorOffset: number): ChangeNode | null {
  const changes = doc.getChanges();
  if (changes.length === 0) {
    return null;
  }

  for (const change of changes) {
    if (change.range.start > cursorOffset) {
      return change;
    }
  }

  return changes[0];
}

export function previousChange(doc: VirtualDocument, cursorOffset: number): ChangeNode | null {
  const changes = doc.getChanges();
  if (changes.length === 0) {
    return null;
  }

  for (let i = changes.length - 1; i >= 0; i--) {
    // Skip changes that contain the cursor (cursor is inside the change)
    if (cursorOffset >= changes[i].range.start && cursorOffset < changes[i].range.end) {
      continue;
    }
    if (changes[i].range.start < cursorOffset) {
      return changes[i];
    }
  }

  return changes[changes.length - 1];
}
