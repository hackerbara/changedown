export type ExportMode = 'tracked' | 'settled' | 'clean';
export type CommentMode = 'all' | 'none' | 'unresolved';

export type { ImageFormat, ImageDimensions, ImageInfo, ImagePatchInfo, MediaInjection }
  from './shared/image-types.js';

export interface ImportOptions {
  pandocPath?: string;
  comments?: boolean;
  mergeSubstitutions?: boolean;
  resolvedComments?: 'import' | 'skip';
  mediaDir?: string;        // output directory for extracted media
  extractMedia?: boolean;   // whether to extract media (default: true)
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
  mediaDir?: string;         // directory containing image files
  defaultDpi?: number;       // DPI for images without metadata (default: 96)
  maxWidthInches?: number;   // page content width clamp (default: 6.5)
  fileReader?: (path: string) => Uint8Array | null;
}

export interface ExportStats {
  insertions: number;
  deletions: number;
  substitutions: number;
  comments: number;
  authors: string[];
  fileSize: number;
}
