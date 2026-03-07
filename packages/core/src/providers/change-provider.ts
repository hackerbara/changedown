import { VirtualDocument } from '../model/document.js';
import { ChangeNode, TextEdit } from '../model/types.js';

/**
 * Abstraction over different change-tracking backends.
 *
 * CriticMarkup files (markdown) and sidecar-annotated code files
 * both produce ChangeNode[], but parse and accept/reject logic differs.
 * This interface lets the Workspace dispatch transparently.
 */
export interface ChangeProvider {
  parse(text: string, languageId?: string): VirtualDocument;
  acceptChange(change: ChangeNode, text: string, languageId?: string): TextEdit[];
  rejectChange(change: ChangeNode, text: string, languageId?: string): TextEdit[];
}
