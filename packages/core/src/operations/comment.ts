import { TextEdit, OffsetRange } from '../model/types.js';

export function insertComment(commentText: string, offset: number, selectionRange?: OffsetRange, selectedText?: string): TextEdit {
  const formattedComment = commentText ? `{>> ${commentText} <<}` : '{>>  <<}';

  if (selectionRange && selectedText !== undefined) {
    return {
      offset: selectionRange.start,
      length: selectionRange.end - selectionRange.start,
      newText: `{==${selectedText}==}${formattedComment}`,
    };
  }

  return {
    offset,
    length: 0,
    newText: formattedComment,
  };
}
