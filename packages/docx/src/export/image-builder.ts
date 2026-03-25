import { ImageRun } from 'docx';
import { imageSize } from 'image-size';
import {
  type ImageDimensions,
  DEFAULT_DPI, MAX_WIDTH_INCHES,
  FALLBACK_WIDTH_INCHES, FALLBACK_HEIGHT_INCHES,
  inchesToPixels, pixelsToInches,
} from '../shared/image-types.js';
import type { ImagePositionMetadata } from '../shared/image-types.js';

export interface DimensionResolutionInput {
  footnoteDimensions?: ImageDimensions;
  pandocAttrs?: { width?: string; height?: string };
  imageBuffer?: Buffer;
  dpi?: number;
  maxWidthInches?: number;
}

/**
 * Resolve image dimensions using the priority cascade:
 * 1. Footnote metadata
 * 2. Pandoc-style attributes
 * 3. Intrinsic dimensions from image buffer
 * 4. Fallback 3x3
 * 5. Clamp to max page width
 */
export function resolveImageDimensions(input: DimensionResolutionInput): ImageDimensions {
  const dpi = input.dpi ?? DEFAULT_DPI;
  const maxWidth = input.maxWidthInches ?? MAX_WIDTH_INCHES;
  let dims: ImageDimensions;

  if (input.footnoteDimensions) {
    dims = { ...input.footnoteDimensions };
  } else if (input.pandocAttrs?.width && input.pandocAttrs?.height) {
    dims = {
      widthIn: parseInches(input.pandocAttrs.width),
      heightIn: parseInches(input.pandocAttrs.height),
    };
  } else if (input.imageBuffer) {
    try {
      const result = imageSize(input.imageBuffer);
      if (result.width && result.height) {
        dims = {
          widthIn: pixelsToInches(result.width, dpi),
          heightIn: pixelsToInches(result.height, dpi),
        };
      } else {
        dims = { widthIn: FALLBACK_WIDTH_INCHES, heightIn: FALLBACK_HEIGHT_INCHES };
      }
    } catch {
      dims = { widthIn: FALLBACK_WIDTH_INCHES, heightIn: FALLBACK_HEIGHT_INCHES };
    }
  } else {
    dims = { widthIn: FALLBACK_WIDTH_INCHES, heightIn: FALLBACK_HEIGHT_INCHES };
  }

  if (dims.widthIn > maxWidth) {
    const ratio = maxWidth / dims.widthIn;
    dims = { widthIn: maxWidth, heightIn: dims.heightIn * ratio };
  }

  return dims;
}

function parseInches(value: string): number {
  const match = value.match(/^([\d.]+)\s*(in|inch|cm|mm|px|%)?$/);
  if (!match) return FALLBACK_WIDTH_INCHES;
  const num = parseFloat(match[1]);
  const unit = match[2] || 'in';
  switch (unit) {
    case 'in': case 'inch': return num;
    case 'cm': return num / 2.54;
    case 'mm': return num / 25.4;
    case 'px': return num / DEFAULT_DPI;
    default: return num;
  }
}

/**
 * Build a docx ImageRun from image data and resolved dimensions.
 * Optionally applies floating/anchor positioning for round-trip fidelity.
 */
export function buildImageRun(
  data: Buffer,
  format: 'png' | 'jpg' | 'gif' | 'bmp',
  dims: ImageDimensions,
  dpi: number = DEFAULT_DPI,
  altText?: { name: string; description: string; title: string },
  position?: ImagePositionMetadata,
): ImageRun {
  const options: Record<string, unknown> = {
    type: format,
    data,
    transformation: {
      width: inchesToPixels(dims.widthIn, dpi),
      height: inchesToPixels(dims.heightIn, dpi),
    },
    ...(altText && { altText }),
  };

  if (position?.float === 'anchor') {
    options.floating = {
      horizontalPosition: {
        relative: position.hAnchor as string,
        offset: position.hOffset,
        align: position.hAlign as string,
      },
      verticalPosition: {
        relative: position.vAnchor as string,
        offset: position.vOffset,
        align: position.vAlign as string,
      },
      behindDocument: position.behindDocument,
      margins: {
        top: position.distT,
        bottom: position.distB,
        left: position.distL,
        right: position.distR,
      },
      ...(position.wrapType && position.wrapType !== 'wrapNone' ? {
        wrap: {
          type: mapWrapType(position.wrapType),
          side: position.wrapSide ? mapWrapSide(position.wrapSide) : undefined,
        },
      } : {}),
    };
  }

  return new ImageRun(options as ConstructorParameters<typeof ImageRun>[0]);
}

function mapWrapType(wt: string): number {
  const map: Record<string, number> = {
    wrapSquare: 1,       // TextWrappingType.SQUARE
    wrapTight: 2,        // TextWrappingType.TIGHT
    wrapTopAndBottom: 3, // TextWrappingType.TOP_AND_BOTTOM
  };
  return map[wt] ?? 0;
}

function mapWrapSide(ws: string): string {
  // TextWrappingSide uses string values in the docx library
  const map: Record<string, string> = {
    bothSides: 'bothSides',
    left: 'left',
    right: 'right',
    largest: 'largest',
  };
  return map[ws] ?? 'bothSides';
}
