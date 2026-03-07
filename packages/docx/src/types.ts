export type ExportMode = 'tracked' | 'settled' | 'clean';
export type CommentMode = 'all' | 'none' | 'unresolved';

export interface ImportOptions {
  pandocPath?: string;
  comments?: boolean;
  mergeSubstitutions?: boolean;
  resolvedComments?: 'import' | 'skip';
}

export interface ImportStats {
  insertions: number;
  deletions: number;
  substitutions: number;
  comments: number;
  authors: string[];
}

export interface ExportOptions {
  title?: string;
  mode?: ExportMode;
  comments?: CommentMode;
  wordOnlineCompat?: boolean;
}

export interface ExportStats {
  insertions: number;
  deletions: number;
  substitutions: number;
  comments: number;
  authors: string[];
  fileSize: number;
}
