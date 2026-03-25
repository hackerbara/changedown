// ---- Constants ----
export const EMU_PER_INCH = 914400;
export const DEFAULT_DPI = 96;
export const EMU_PER_PIXEL = 9525;  // 914400 / 96
export const MAX_WIDTH_INCHES = 6.5;
export const MAX_WIDTH_EMU = MAX_WIDTH_INCHES * EMU_PER_INCH;
export const FALLBACK_WIDTH_INCHES = 3;
export const FALLBACK_HEIGHT_INCHES = 3;

// ---- Types ----
export type ImageFormat = 'png' | 'jpg' | 'gif' | 'svg' | 'bmp' | 'tiff' | 'emf' | 'wmf';

export interface ImageDimensions {
  widthIn: number;
  heightIn: number;
}

export interface ImageInfo {
  filename: string;
  format: ImageFormat;
  dimensions: ImageDimensions;
  previewable: boolean;
}

export interface ImagePatchInfo {
  sentinelName: string;
  changeType: 'ins' | 'del';
  author: string;
  date: string;
  revisionId: number;
}

export interface MediaInjection {
  filename: string;
  data: Buffer;
  contentType: string;
}

/** Floating/anchor positioning metadata for image round-trip fidelity. */
export interface ImagePositionMetadata {
  float?: 'anchor';
  hAnchor?: string;
  hOffset?: number;
  hAlign?: string;
  vAnchor?: string;
  vOffset?: number;
  vAlign?: string;
  wrapType?: string;
  wrapSide?: string;
  behindDocument?: boolean;
  distT?: number; distB?: number; distL?: number; distR?: number;
}

// ---- Conversion helpers ----
export function inchesToPixels(inches: number, dpi: number = DEFAULT_DPI): number {
  return Math.round(inches * dpi);
}

export function pixelsToInches(pixels: number, dpi: number = DEFAULT_DPI): number {
  return pixels / dpi;
}

export function inchesToEmu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH);
}

export function emuToInches(emu: number): number {
  return emu / EMU_PER_INCH;
}

// ---- Format helpers ----
const PREVIEWABLE: Set<string> = new Set(['png', 'jpg', 'gif', 'svg']);

export function isPreviewableFormat(format: string): boolean {
  return PREVIEWABLE.has(format);
}

const EXTENSION_TO_FORMAT: Record<string, ImageFormat> = {
  '.png': 'png', '.jpg': 'jpg', '.jpeg': 'jpg', '.gif': 'gif',
  '.svg': 'svg', '.bmp': 'bmp', '.tiff': 'tiff', '.tif': 'tiff',
  '.emf': 'emf', '.wmf': 'wmf',
};

export function detectFormat(filename: string): ImageFormat | undefined {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return EXTENSION_TO_FORMAT[ext];
}
