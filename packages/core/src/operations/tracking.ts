import { TextEdit } from '../model/types.js';

function appendRef(markup: string, scId?: string): string {
  return scId ? `${markup}[^${scId}]` : markup;
}

export function wrapInsertion(insertedText: string, offset: number, scId?: string): TextEdit {
  return {
    offset,
    length: insertedText.length,
    newText: appendRef(`{++${insertedText}++}`, scId),
  };
}

export function wrapDeletion(deletedText: string, offset: number, scId?: string): TextEdit {
  return {
    offset,
    length: 0,
    newText: appendRef(`{--${deletedText}--}`, scId),
  };
}

export function wrapSubstitution(oldText: string, newText: string, offset: number, scId?: string): TextEdit {
  return {
    offset,
    length: newText.length,
    newText: appendRef(`{~~${oldText}~>${newText}~~}`, scId),
  };
}
