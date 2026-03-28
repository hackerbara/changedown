import { ChangeNode } from '@changedown/core';
import { AUTHOR_PALETTE, ThemeColor } from './palette.js';

export class PreviewAuthorColorMap {
    private map: Map<string, number> = new Map();

    getIndex(author: string): number {
        if (this.map.has(author)) return this.map.get(author)!;
        const idx = this.map.size % AUTHOR_PALETTE.length;
        this.map.set(author, idx);
        return idx;
    }

    getColor(author: string): ThemeColor {
        return { ...AUTHOR_PALETTE[this.getIndex(author)] };
    }

    /**
     * Determine whether per-author colors should be applied.
     * 'always' -> true, 'never' -> false,
     * 'auto' -> true only when 2+ distinct authors are present.
     */
    static shouldApplyColors(
        changes: ChangeNode[],
        mode: 'auto' | 'always' | 'never'
    ): boolean {
        if (mode === 'always') return true;
        if (mode === 'never') return false;
        const authors = new Set<string>();
        for (const c of changes) {
            const author = c.metadata?.author;
            if (author) authors.add(author);
            if (authors.size >= 2) return true;
        }
        return false;
    }
}
