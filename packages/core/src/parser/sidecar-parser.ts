import { ChangeNode, ChangeType, ChangeStatus } from '../model/types.js';
import { VirtualDocument } from '../model/document.js';
import { getCommentSyntax, stripLineComment, CommentSyntax, escapeRegex, lineOffset } from '../comment-syntax.js';
import { SIDECAR_BLOCK_MARKER, findSidecarBlockStart } from '../constants.js';

/** Parsed metadata from a sidecar block footnote entry. */
interface SidecarEntryMeta {
  type: string;   // 'ins' | 'del' | 'sub'
  status: string; // 'pending' | 'accepted' | 'rejected'
  author?: string;
  date?: string;
  reason?: string;
  original?: string;
}

/** A tagged line found during inline scanning. */
interface TaggedLine {
  /** The ct-N or ct-N.M tag. */
  tag: string;
  /** Index of this line in the full lines array. */
  lineIndex: number;
  /** The stripped code content (without annotations). */
  code: string;
  /** Whether this is a deletion marker line. */
  isDeletion: boolean;
  /** Leading whitespace/indentation. */
  indent: string;
}

/** Grouped tagged lines for a single sc tag. */
interface TagGroup {
  tag: string;
  deletions: TaggedLine[];
  insertions: TaggedLine[];
}

/**
 * Parses sidecar-annotated code files back into ChangeNode[].
 *
 * A sidecar-annotated file has:
 * 1. Code lines with ct-N tags (insertion/deletion markers)
 * 2. A sidecar metadata block at the bottom with footnote entries
 *
 * The parser extracts both, groups tagged lines by ct-N tag,
 * and constructs ChangeNode[] with proper types, ranges, and metadata.
 */
export class SidecarParser {
  parse(text: string, languageId: string): VirtualDocument {
    const syntax = getCommentSyntax(languageId);
    if (!syntax) {
      return new VirtualDocument([]);
    }

    if (text === '') {
      return new VirtualDocument([]);
    }

    const lines = text.split('\n');

    // Step 1: Find and parse the sidecar block
    const sidecarStart = findSidecarBlockStart(lines, syntax.line);
    const entryMap = sidecarStart >= 0
      ? this.parseSidecarBlock(lines, sidecarStart, syntax)
      : new Map<string, SidecarEntryMeta>();

    // Step 2: Scan code lines (before sidecar block) for ct-N tags
    const codeLineEnd = sidecarStart >= 0 ? sidecarStart : lines.length;
    const taggedLines = this.scanTaggedLines(lines, codeLineEnd, syntax);

    if (taggedLines.length === 0) {
      return new VirtualDocument([]);
    }

    // Step 3: Group tagged lines by tag (preserving first-seen order)
    const tagGroups = this.groupByTag(taggedLines);

    // Step 4: Build ChangeNode[] from groups + sidecar metadata
    const changes = this.buildChangeNodes(tagGroups, entryMap, lines);

    return new VirtualDocument(changes);
  }

  /**
   * Parses the sidecar block starting at the given line index.
   * Returns a map from tag (e.g. "ct-1") to its metadata.
   */
  private parseSidecarBlock(
    lines: string[],
    startIndex: number,
    syntax: CommentSyntax
  ): Map<string, SidecarEntryMeta> {
    const map = new Map<string, SidecarEntryMeta>();
    const cm = escapeRegex(syntax.line);

    // Pattern for footnote entry: `COMMENT [^ct-N]: TYPE | STATUS`
    const entryPattern = new RegExp(
      `^${cm}\\s+\\[\\^(ct-\\d+(?:\\.\\d+)?)\\]:\\s+(\\w+)\\s+\\|\\s+(\\w+)`
    );

    // Pattern for field lines: `COMMENT     key: value`
    const fieldPattern = new RegExp(
      `^${cm}\\s{4,}(\\w+):\\s+(.+)$`
    );

    // Closing delimiter: `COMMENT ---`
    const closePattern = new RegExp(`^${cm}\\s+-{3,}`);

    let currentTag: string | null = null;

    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];

      // Check for closing delimiter
      if (closePattern.test(line)) {
        break;
      }

      // Check for footnote entry
      const entryMatch = line.match(entryPattern);
      if (entryMatch) {
        currentTag = entryMatch[1];
        map.set(currentTag, {
          type: entryMatch[2],
          status: entryMatch[3],
        });
        continue;
      }

      // Check for field line (belongs to currentTag)
      if (currentTag) {
        const fieldMatch = line.match(fieldPattern);
        if (fieldMatch) {
          const key = fieldMatch[1];
          let value = fieldMatch[2];
          const entry = map.get(currentTag)!;

          // Strip surrounding quotes if present
          if (value.startsWith('"')) {
            const closingQuote = value.indexOf('"', 1);
            if (closingQuote > 0) {
              value = value.slice(1, closingQuote);
            }
          }

          switch (key) {
            case 'author':
              entry.author = value;
              break;
            case 'date':
              entry.date = value;
              break;
            case 'reason':
              entry.reason = value;
              break;
            case 'original':
              entry.original = value;
              break;
          }
        }
      }
    }

    return map;
  }

  /**
   * Scans lines up to the sidecar block for ct-N tags.
   * Returns an array of tagged lines with their line index and parsed info.
   */
  private scanTaggedLines(
    lines: string[],
    endIndex: number,
    syntax: CommentSyntax
  ): TaggedLine[] {
    const result: TaggedLine[] = [];

    for (let i = 0; i < endIndex; i++) {
      const stripped = stripLineComment(lines[i], syntax);
      if (stripped) {
        result.push({
          tag: stripped.tag,
          lineIndex: i,
          code: stripped.code,
          isDeletion: stripped.isDeletion,
          indent: stripped.indent,
        });
      }
    }

    return result;
  }

  /**
   * Groups tagged lines by their ct-N tag.
   * Preserves insertion order (first tag seen comes first).
   */
  private groupByTag(taggedLines: TaggedLine[]): TagGroup[] {
    const groupMap = new Map<string, TagGroup>();
    const orderedTags: string[] = [];

    for (const tl of taggedLines) {
      let group = groupMap.get(tl.tag);
      if (!group) {
        group = { tag: tl.tag, deletions: [], insertions: [] };
        groupMap.set(tl.tag, group);
        orderedTags.push(tl.tag);
      }
      if (tl.isDeletion) {
        group.deletions.push(tl);
      } else {
        group.insertions.push(tl);
      }
    }

    return orderedTags.map(t => groupMap.get(t)!);
  }

  /**
   * Builds ChangeNode[] from grouped tagged lines and sidecar metadata.
   */
  private buildChangeNodes(
    tagGroups: TagGroup[],
    entryMap: Map<string, SidecarEntryMeta>,
    lines: string[]
  ): ChangeNode[] {
    const changes: ChangeNode[] = [];

    for (const group of tagGroups) {
      const meta = entryMap.get(group.tag);
      const hasDeletions = group.deletions.length > 0;
      const hasInsertions = group.insertions.length > 0;

      // Determine change type
      let changeType: ChangeType;
      if (meta?.type === 'sub' || (hasDeletions && hasInsertions)) {
        changeType = ChangeType.Substitution;
      } else if (meta?.type === 'del' || (hasDeletions && !hasInsertions)) {
        changeType = ChangeType.Deletion;
      } else {
        changeType = ChangeType.Insertion;
      }

      // Determine status
      let status: ChangeStatus;
      switch (meta?.status) {
        case 'accepted':
          status = ChangeStatus.Accepted;
          break;
        case 'rejected':
          status = ChangeStatus.Rejected;
          break;
        default:
          status = ChangeStatus.Proposed;
      }

      // Compute range: from first tagged line to last tagged line
      const allTaggedLines = [...group.deletions, ...group.insertions];
      allTaggedLines.sort((a, b) => a.lineIndex - b.lineIndex);

      const firstLine = allTaggedLines[0].lineIndex;
      const lastLine = allTaggedLines[allTaggedLines.length - 1].lineIndex;
      const rangeStart = lineOffset(lines, firstLine);
      // End includes the full last line + its newline (if not the very last line)
      const rangeEnd = lineOffset(lines, lastLine) + lines[lastLine].length + 1;

      const range = { start: rangeStart, end: rangeEnd };

      // Build originalText from deletion lines
      let originalText: string | undefined;
      if (hasDeletions) {
        originalText = group.deletions.map(d => d.code).join('\n');
      } else if (meta?.original) {
        originalText = meta.original;
      }

      // Build modifiedText from insertion lines
      let modifiedText: string | undefined;
      if (hasInsertions) {
        modifiedText = group.insertions.map(ins => ins.code).join('\n');
      }

      // Build metadata
      let metadata: ChangeNode['metadata'];
      if (meta?.author || meta?.date || meta?.reason) {
        metadata = {};
        if (meta.author) {
          metadata.author = meta.author;
        }
        if (meta.date) {
          metadata.date = meta.date;
        }
        if (meta.reason) {
          metadata.comment = meta.reason;
        }
      }

      const node: ChangeNode = {
        id: group.tag,
        type: changeType,
        status,
        range,
        contentRange: { ...range },
        level: 0,
        anchored: false,
      };

      if (originalText !== undefined) {
        node.originalText = originalText;
      }
      if (modifiedText !== undefined) {
        node.modifiedText = modifiedText;
      }
      if (metadata) {
        node.metadata = metadata;
      }

      changes.push(node);
    }

    return changes;
  }
}

