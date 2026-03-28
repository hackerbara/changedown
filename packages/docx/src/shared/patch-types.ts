/** Patch info types for JSZip post-processing of tracked changes. */

export interface CommentPatchInfo {
  id: number;
  paraId: string;
  parentParaId?: string;
}

export interface ImagePatchInfo {
  sentinelName: string;
  changeType: 'ins' | 'del';
  author: string;
  date: string;
  revisionId: number;
}

export interface HyperlinkPatchInfo {
  sentinelUrl: string;
  realUrl: string;
  changeType: 'ins' | 'del';
  author: string;
  date: string;
  revisionId: number;
}
