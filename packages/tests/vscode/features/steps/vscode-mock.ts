/**
 * Minimal vscode mock for @fast tier decoration tests.
 *
 * EditorDecorator, SpyEditor, converters, and visual-semantics all
 * `require('vscode')`. In the VS Code Extension Host this resolves
 * to the real API. For @fast Cucumber tests (Node.js, no VS Code),
 * we inject this mock into require.cache BEFORE those modules load.
 *
 * Only the surface area actually exercised by decoration tests is
 * implemented. Anything else throws so we catch drift early.
 */

// ── Core geometry classes ───────────────────────────────────────────

class MockPosition {
    readonly line: number;
    readonly character: number;

    constructor(line: number, character: number) {
        this.line = line;
        this.character = character;
    }

    isEqual(other: MockPosition): boolean {
        return this.line === other.line && this.character === other.character;
    }

    isBefore(other: MockPosition): boolean {
        return this.line < other.line || (this.line === other.line && this.character < other.character);
    }

    isBeforeOrEqual(other: MockPosition): boolean {
        return this.isEqual(other) || this.isBefore(other);
    }

    isAfter(other: MockPosition): boolean {
        return !this.isBeforeOrEqual(other);
    }

    isAfterOrEqual(other: MockPosition): boolean {
        return this.isEqual(other) || this.isAfter(other);
    }

    compareTo(other: MockPosition): number {
        if (this.isBefore(other)) return -1;
        if (this.isAfter(other)) return 1;
        return 0;
    }

    translate(lineDelta?: number, characterDelta?: number): MockPosition {
        return new MockPosition(
            this.line + (lineDelta ?? 0),
            this.character + (characterDelta ?? 0)
        );
    }

    with(line?: number, character?: number): MockPosition {
        return new MockPosition(line ?? this.line, character ?? this.character);
    }
}

class MockRange {
    readonly start: MockPosition;
    readonly end: MockPosition;

    constructor(startLine: number, startChar: number, endLine: number, endChar: number);
    constructor(start: MockPosition, end: MockPosition);
    constructor(a: number | MockPosition, b: number | MockPosition, c?: number, d?: number) {
        if (typeof a === 'number') {
            this.start = new MockPosition(a, b as number);
            this.end = new MockPosition(c!, d!);
        } else {
            this.start = a;
            this.end = b as MockPosition;
        }
    }

    get isEmpty(): boolean {
        return this.start.isEqual(this.end);
    }

    get isSingleLine(): boolean {
        return this.start.line === this.end.line;
    }

    contains(positionOrRange: MockPosition | MockRange): boolean {
        if (positionOrRange instanceof MockRange) {
            return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
        }
        const pos = positionOrRange;
        if (pos.isBefore(this.start)) return false;
        if (pos.isAfter(this.end)) return false;
        return true;
    }

    intersection(range: MockRange): MockRange | undefined {
        const start = this.start.isBefore(range.start) ? range.start : this.start;
        const end = this.end.isBefore(range.end) ? this.end : range.end;
        if (start.isAfter(end)) return undefined;
        return new MockRange(start, end);
    }

    union(other: MockRange): MockRange {
        const start = this.start.isBefore(other.start) ? this.start : other.start;
        const end = this.end.isAfter(other.end) ? this.end : other.end;
        return new MockRange(start, end);
    }

    isEqual(other: MockRange): boolean {
        return this.start.isEqual(other.start) && this.end.isEqual(other.end);
    }

    with(start?: MockPosition, end?: MockPosition): MockRange {
        return new MockRange(start ?? this.start, end ?? this.end);
    }
}

class MockSelection extends MockRange {
    readonly anchor: MockPosition;
    readonly active: MockPosition;
    readonly isReversed: boolean;

    constructor(anchorLine: number, anchorChar: number, activeLine: number, activeChar: number);
    constructor(anchor: MockPosition, active: MockPosition);
    constructor(a: number | MockPosition, b: number | MockPosition, c?: number, d?: number) {
        let anchor: MockPosition;
        let active: MockPosition;
        if (typeof a === 'number') {
            anchor = new MockPosition(a, b as number);
            active = new MockPosition(c!, d!);
        } else {
            anchor = a;
            active = b as MockPosition;
        }
        const start = anchor.isBefore(active) ? anchor : active;
        const end = anchor.isBefore(active) ? active : anchor;
        super(start, end);
        this.anchor = anchor;
        this.active = active;
        this.isReversed = anchor.isAfter(active);
    }
}

class MockMarkdownString {
    value: string;
    isTrusted: boolean;
    supportThemeIcons: boolean;
    supportHtml: boolean;

    constructor(value?: string, supportThemeIcons?: boolean) {
        this.value = value ?? '';
        this.isTrusted = false;
        this.supportThemeIcons = supportThemeIcons ?? false;
        this.supportHtml = false;
    }

    appendText(value: string): MockMarkdownString {
        this.value += value;
        return this;
    }

    appendMarkdown(value: string): MockMarkdownString {
        this.value += value;
        return this;
    }
}

class MockThemeIcon {
    readonly id: string;
    readonly color?: { id: string };
    constructor(id: string, color?: { id: string }) {
        this.id = id;
        this.color = color;
    }
}

// ── Decoration type counter (for unique object identity) ────────────

let decorationTypeCounter = 0;

class MockTextEditorDecorationType {
    readonly key: string;
    private _disposed = false;

    constructor(_options: any) {
        this.key = `mock-decoration-${decorationTypeCounter++}`;
    }

    dispose(): void {
        this._disposed = true;
    }
}

// ── EventEmitter (needed by ProjectStatusModel, SettingsPanelProvider) ──

type Listener<T> = (e: T) => void;

class MockEventEmitter<T> {
    private listeners: Listener<T>[] = [];

    readonly event = (listener: Listener<T>): { dispose: () => void } => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };

    fire(data: T): void {
        for (const listener of this.listeners) {
            listener(data);
        }
    }

    dispose(): void {
        this.listeners = [];
    }
}

// ── Minimal window API ──────────────────────────────────────────────

const mockWindow = {
    createTextEditorDecorationType(options: any): MockTextEditorDecorationType {
        return new MockTextEditorDecorationType(options);
    },
    createStatusBarItem(_alignment?: number, _priority?: number) {
        return { text: '', tooltip: '', command: '', show() {}, hide() {}, dispose() {} };
    },
};

// ── The mock module ─────────────────────────────────────────────────

const vscodeMock = {
    Position: MockPosition,
    Range: MockRange,
    Selection: MockSelection,
    MarkdownString: MockMarkdownString,
    ThemeIcon: MockThemeIcon,
    TextEditorDecorationType: MockTextEditorDecorationType,
    EventEmitter: MockEventEmitter,
    window: mockWindow,
    // Uri is sometimes accessed — provide a minimal stub
    Uri: {
        file: (path: string) => ({ fsPath: path, scheme: 'file' }),
        parse: (value: string) => ({ fsPath: value, scheme: 'file' }),
    },
    // VS Code enum stubs
    OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    // Enum stubs that visual-semantics.ts references indirectly
    ThemeColor: class MockThemeColor { constructor(public readonly id: string) {} },
    // Workspace stub for settings-panel, project-status
    workspace: {
        getConfiguration: () => ({
            get: () => undefined,
            update: async () => {},
        }),
    },
    // ConfigurationTarget stub
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    // ExtensionMode stub
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
};

// ── Registration: inject into require.cache ─────────────────────────

/**
 * Call this BEFORE requiring any module that imports 'vscode'.
 * It patches Node's module resolution so `require('vscode')` returns
 * our mock instead of throwing MODULE_NOT_FOUND.
 */
export function installVscodeMock(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Module = require('module');
    const originalResolveFilename = Module._resolveFilename;

    Module._resolveFilename = function (request: string, parent: any, ...rest: any[]) {
        if (request === 'vscode') {
            // Return a sentinel path that we control
            return 'vscode';
        }
        return originalResolveFilename.call(this, request, parent, ...rest);
    };

    // Insert the mock into the cache under the sentinel path
    require.cache['vscode'] = {
        id: 'vscode',
        filename: 'vscode',
        loaded: true,
        exports: vscodeMock,
        children: [],
        paths: [],
        path: '',
        parent: null,
        require: require,
        isPreloading: false,
    } as any;
}

/**
 * Reset the decoration type counter (call in Before hook to ensure
 * deterministic decoration type ordering).
 */
export function resetDecorationTypeCounter(): void {
    decorationTypeCounter = 0;
}

// Export types for use in step definitions
export type { MockPosition, MockRange, MockSelection, MockMarkdownString };
