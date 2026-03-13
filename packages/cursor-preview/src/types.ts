/** A single CriticMarkup match found in text content */
export interface ScanMatch {
  /** 'insertion' | 'deletion' | 'substitution' | 'highlight' | 'comment' | 'footnote-ref' */
  type: ScanMatchType;
  /** Start offset in concatenated text */
  start: number;
  /** End offset in concatenated text (exclusive) */
  end: number;
  /** For substitution: offset of ~> separator */
  separatorStart?: number;
  separatorEnd?: number;
  /** Regions within the match */
  regions: MatchRegion[];
}

export type ScanMatchType = 'insertion' | 'deletion' | 'substitution' | 'highlight' | 'comment' | 'footnote-ref';

/** A sub-region of a match (delimiter vs content) */
export interface MatchRegion {
  role: 'open-delim' | 'close-delim' | 'separator' | 'content' | 'old-content' | 'new-content';
  start: number;
  end: number;
}

/** Maps a text offset to a specific DOM text node + local offset */
export interface TextNodePosition {
  node: Text;
  offset: number;
}

/** Position map entry: a text node with its global offset range */
export interface TextNodeEntry {
  node: Text;
  globalStart: number;
  globalEnd: number;
}

/** Rendering strategy interface */
export interface RenderStrategy {
  apply(container: Element, matches: ScanMatch[], positionMap: TextNodeEntry[]): void;
  clear(): void;
  readonly name: string;
}

/** Config read from localStorage bridge */
export interface BridgeConfig {
  enabled: boolean;
  smartView: boolean;
  authorColors: Record<string, string>;
}
