import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { ChangeTracksWorld } from './world.js';
import {
  createHover,
  createCodeActions,
  createDiagnostics,
  createCodeLenses,
  createDocumentLinks,
  Position,
  CodeActionKind,
  DiagnosticSeverity,
} from '@changetracks/lsp-server/internals';
import type { Diagnostic, CodeLens } from '@changetracks/lsp-server/internals';
import {
  buildSemanticTokens,
  getSemanticTokensLegend,
} from '@changetracks/lsp-server/internals';
import type { SemanticTokensLegend } from '@changetracks/lsp-server/internals';
import { ChangeNode, ChangeType, ChangeStatus } from '@changetracks/core';

// =============================================================================
// LSP World state — stored on the Cucumber world via ad-hoc properties
// =============================================================================

interface LspState {
  documentText: string;
  documentUri: string;
  changes: ChangeNode[];
  diagnostics: Diagnostic[];
  /** Latest hover result */
  hoverResult: ReturnType<typeof createHover> | undefined;
  /** Latest code actions */
  codeActions: ReturnType<typeof createCodeActions> | undefined;
  /** Latest code lenses */
  codeLenses: CodeLens[] | undefined;
  /** Latest document links */
  documentLinks: ReturnType<typeof createDocumentLinks> | undefined;
  /** Latest semantic tokens data */
  semanticTokensData: number[] | undefined;
  /** Latest semantic tokens legend */
  semanticTokensLegend: SemanticTokensLegend | undefined;
  /** Diagnostic for code-action requests */
  activeDiagnostic: Diagnostic | undefined;
}

function getLsp(world: ChangeTracksWorld): LspState {
  if (!(world as any).__lsp) {
    (world as any).__lsp = {
      documentText: '',
      documentUri: 'file:///test.md',
      changes: [],
      diagnostics: [],
      hoverResult: undefined,
      codeActions: undefined,
      codeLenses: undefined,
      documentLinks: undefined,
      semanticTokensData: undefined,
      semanticTokensLegend: undefined,
      activeDiagnostic: undefined,
    } as LspState;
  }
  return (world as any).__lsp;
}

// =============================================================================
// Given — document text
// =============================================================================

Given(
  'the document text {string}',
  function (this: ChangeTracksWorld, text: string) {
    const lsp = getLsp(this);
    lsp.documentText = text.replace(/\\n/g, '\n');
    lsp.changes = [];
  },
);

Given(
  'the document text:',
  function (this: ChangeTracksWorld, docString: string) {
    const lsp = getLsp(this);
    lsp.documentText = docString;
    lsp.changes = [];
  },
);

Given(
  'the document text with a 100-character insertion',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    const longText = 'a'.repeat(100);
    lsp.documentText = `{++${longText}++}`;
    lsp.changes = [
      {
        id: 'change-long',
        type: ChangeType.Insertion,
        status: ChangeStatus.Proposed,
        range: { start: 0, end: lsp.documentText.length },
        contentRange: { start: 3, end: lsp.documentText.length - 3 },
        level: 2,
        anchored: true,
      },
    ];
  },
);

// =============================================================================
// Given — parsed changes for diagnostics / code-lens / semantic-tokens
// =============================================================================

Given(
  'no parsed changes',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    lsp.changes = [];
  },
);

Given(
  'a parsed insertion {string} at {int}-{int} with content {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number, cStart: number, cEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id,
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: cStart, end: cEnd },
      modifiedText: lsp.documentText.substring(cStart, cEnd),
      level: 2,
      anchored: true,
    });
  },
);

Given(
  'a parsed deletion {string} at {int}-{int} with content {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number, cStart: number, cEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id,
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: cStart, end: cEnd },
      originalText: lsp.documentText.substring(cStart, cEnd),
      level: 2,
      anchored: true,
    });
  },
);

Given(
  'a parsed highlight {string} at {int}-{int} with content {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number, cStart: number, cEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id,
      type: ChangeType.Highlight,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: cStart, end: cEnd },
      originalText: lsp.documentText.substring(cStart, cEnd),
      level: 2,
      anchored: true,
    });
  },
);

Given(
  'a parsed comment {string} at {int}-{int} with content {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number, cStart: number, cEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id,
      type: ChangeType.Comment,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: cStart, end: cEnd },
      level: 2,
      anchored: true,
    });
  },
);

Given(
  'a parsed substitution {string} at {int}-{int} with original {int}-{int} and modified {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number, oStart: number, oEnd: number, mStart: number, mEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id,
      type: ChangeType.Substitution,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: oStart, end: mEnd },
      originalRange: { start: oStart, end: oEnd },
      modifiedRange: { start: mStart, end: mEnd },
      originalText: lsp.documentText.substring(oStart, oEnd),
      modifiedText: lsp.documentText.substring(mStart, mEnd),
      level: 2,
      anchored: true,
    });
  },
);

// --- Semantic-tokens-specific Given steps ---

Given(
  'a parsed insertion at content range {int}-{int} with status {string}',
  function (this: ChangeTracksWorld, cStart: number, cEnd: number, status: string) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Insertion,
      status: status === 'Accepted' ? ChangeStatus.Accepted : ChangeStatus.Proposed,
      range: { start: 0, end: 14 },
      contentRange: { start: cStart, end: cEnd },
      level: 0,
      anchored: false,
    });
  },
);

Given(
  'a parsed deletion at content range {int}-{int} with status {string}',
  function (this: ChangeTracksWorld, cStart: number, cEnd: number, status: string) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Deletion,
      status: status === 'Accepted' ? ChangeStatus.Accepted : ChangeStatus.Proposed,
      range: { start: 0, end: 14 },
      contentRange: { start: cStart, end: cEnd },
      level: 0,
      anchored: false,
    });
  },
);

Given(
  'a parsed highlight at content range {int}-{int} with status {string}',
  function (this: ChangeTracksWorld, cStart: number, cEnd: number, status: string) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Highlight,
      status: status === 'Accepted' ? ChangeStatus.Accepted : ChangeStatus.Proposed,
      range: { start: 0, end: 14 },
      contentRange: { start: cStart, end: cEnd },
      level: 0,
      anchored: false,
    });
  },
);

Given(
  'a parsed comment at content range {int}-{int} with status {string}',
  function (this: ChangeTracksWorld, cStart: number, cEnd: number, status: string) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Comment,
      status: status === 'Accepted' ? ChangeStatus.Accepted : ChangeStatus.Proposed,
      range: { start: 0, end: 14 },
      contentRange: { start: cStart, end: cEnd },
      level: 0,
      anchored: false,
    });
  },
);

Given(
  'a parsed substitution with original range {int}-{int} and modified range {int}-{int}',
  function (this: ChangeTracksWorld, oStart: number, oEnd: number, mStart: number, mEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Substitution,
      status: ChangeStatus.Proposed,
      range: { start: 0, end: 20 },
      contentRange: { start: oStart, end: mEnd },
      originalRange: { start: oStart, end: oEnd },
      modifiedRange: { start: mStart, end: mEnd },
      level: 0,
      anchored: false,
    });
  },
);

Given(
  'a parsed move-to insertion at content range {int}-{int}',
  function (this: ChangeTracksWorld, cStart: number, cEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: 0, end: 14 },
      contentRange: { start: cStart, end: cEnd },
      level: 0,
      anchored: false,
      moveRole: 'to',
      groupId: 'g1',
    });
  },
);

Given(
  'a parsed move-from deletion at content range {int}-{int}',
  function (this: ChangeTracksWorld, cStart: number, cEnd: number) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: 0, end: 14 },
      contentRange: { start: cStart, end: cEnd },
      level: 0,
      anchored: false,
      moveRole: 'from',
      groupId: 'g1',
    });
  },
);

// --- Hover-specific Given steps ---

Given(
  'changes include a highlight at {int}-{int} with comment {string}',
  function (this: ChangeTracksWorld, rStart: number, rEnd: number, comment: string) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Highlight,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: rStart + 3, end: rEnd - 3 },
      metadata: { comment },
      level: 0,
      anchored: false,
    });
  },
);

Given(
  'changes include an insertion at {int}-{int} with reason {string}',
  function (this: ChangeTracksWorld, rStart: number, rEnd: number, reason: string) {
    const lsp = getLsp(this);
    lsp.changes.push({
      id: '1',
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: rStart + 3, end: rEnd - 3 },
      metadata: { comment: reason },
      level: 0,
      anchored: false,
    });
  },
);

// --- Code-action-specific Given steps ---

Given(
  'a diagnostic for insertion {string} at {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number) {
    const lsp = getLsp(this);
    // Build the change node
    const contentStart = rStart + 3;
    const contentEnd = rEnd - 3;
    const change: ChangeNode = {
      id,
      type: ChangeType.Insertion,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: contentStart, end: contentEnd },
      modifiedText: lsp.documentText.substring(contentStart, contentEnd),
      level: 2,
      anchored: true,
    };
    lsp.changes.push(change);
    lsp.activeDiagnostic = {
      range: { start: { line: 0, character: rStart }, end: { line: 0, character: rEnd } },
      severity: DiagnosticSeverity.Information,
      source: 'changetracks',
      message: `Insertion: ${change.modifiedText}`,
      code: id,
      data: { changeId: id, changeType: ChangeType.Insertion },
    };
  },
);

Given(
  'a diagnostic for deletion {string} at {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number) {
    const lsp = getLsp(this);
    const contentStart = rStart + 3;
    const contentEnd = rEnd - 3;
    const change: ChangeNode = {
      id,
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: contentStart, end: contentEnd },
      originalText: lsp.documentText.substring(contentStart, contentEnd),
      level: 2,
      anchored: true,
    };
    lsp.changes.push(change);
    lsp.activeDiagnostic = {
      range: { start: { line: 0, character: rStart }, end: { line: 0, character: rEnd } },
      severity: DiagnosticSeverity.Information,
      source: 'changetracks',
      message: `Deletion: ${change.originalText}`,
      code: id,
      data: { changeId: id, changeType: ChangeType.Deletion },
    };
  },
);

Given(
  'a diagnostic for substitution {string} at {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number) {
    const lsp = getLsp(this);
    // For {~~world~>universe~~} the structure is {~~ original ~> modified ~~}
    const text = lsp.documentText;
    const inner = text.substring(rStart + 3, rEnd - 3); // "world~>universe"
    const arrowIdx = inner.indexOf('~>');
    const originalText = inner.substring(0, arrowIdx);
    const modifiedText = inner.substring(arrowIdx + 2);
    const originalStart = rStart + 3;
    const originalEnd = originalStart + originalText.length;
    const modifiedStart = originalEnd + 2; // skip ~>
    const modifiedEnd = modifiedStart + modifiedText.length;

    const change: ChangeNode = {
      id,
      type: ChangeType.Substitution,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: originalStart, end: modifiedEnd },
      originalRange: { start: originalStart, end: originalEnd },
      modifiedRange: { start: modifiedStart, end: modifiedEnd },
      originalText,
      modifiedText,
      level: 2,
      anchored: true,
    };
    lsp.changes.push(change);
    lsp.activeDiagnostic = {
      range: { start: { line: 0, character: rStart }, end: { line: 0, character: rEnd } },
      severity: DiagnosticSeverity.Information,
      source: 'changetracks',
      message: `Substitution: ${originalText} \u2192 ${modifiedText}`,
      code: id,
      data: { changeId: id, changeType: ChangeType.Substitution },
    };
  },
);

Given(
  'a diagnostic for highlight {string} at {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number) {
    const lsp = getLsp(this);
    const contentStart = rStart + 3;
    const contentEnd = rEnd - 3;
    const change: ChangeNode = {
      id,
      type: ChangeType.Highlight,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: contentStart, end: contentEnd },
      originalText: lsp.documentText.substring(contentStart, contentEnd),
      level: 2,
      anchored: true,
    };
    lsp.changes.push(change);
    lsp.activeDiagnostic = {
      range: { start: { line: 0, character: rStart }, end: { line: 0, character: rEnd } },
      severity: DiagnosticSeverity.Information,
      source: 'changetracks',
      message: `Highlight: ${change.originalText}`,
      code: id,
      data: { changeId: id, changeType: ChangeType.Highlight },
    };
  },
);

Given(
  'a diagnostic for comment {string} at {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number) {
    const lsp = getLsp(this);
    const contentStart = rStart + 3;
    const contentEnd = rEnd - 3;
    const change: ChangeNode = {
      id,
      type: ChangeType.Comment,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: contentStart, end: contentEnd },
      level: 2,
      anchored: true,
    };
    lsp.changes.push(change);
    lsp.activeDiagnostic = {
      range: { start: { line: 0, character: rStart }, end: { line: 0, character: rEnd } },
      severity: DiagnosticSeverity.Information,
      source: 'changetracks',
      message: `Comment: ${lsp.documentText.substring(contentStart, contentEnd)}`,
      code: id,
      data: { changeId: id, changeType: ChangeType.Comment },
    };
  },
);

Given(
  'a second change deletion {string} at {int}-{int}',
  function (this: ChangeTracksWorld, id: string, rStart: number, rEnd: number) {
    const lsp = getLsp(this);
    const contentStart = rStart + 3;
    const contentEnd = rEnd - 3;
    lsp.changes.push({
      id,
      type: ChangeType.Deletion,
      status: ChangeStatus.Proposed,
      range: { start: rStart, end: rEnd },
      contentRange: { start: contentStart, end: contentEnd },
      originalText: lsp.documentText.substring(contentStart, contentEnd),
      level: 2,
      anchored: true,
    });
  },
);

// =============================================================================
// When — LSP operations
// =============================================================================

When(
  'I hover at line {int} character {int}',
  function (this: ChangeTracksWorld, line: number, character: number) {
    const lsp = getLsp(this);
    const text = lsp.documentText;
    // If no explicit changes were added, parse the document to build changes
    if (lsp.changes.length === 0) {
      // Lightweight auto-detect for comment nodes from the document text
      const changes = autoParseChanges(text);
      lsp.changes = changes;
    }
    const position = Position.create(line, character);
    lsp.hoverResult = createHover(position, lsp.changes, text);
  },
);

When(
  'I request code actions',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    assert.ok(lsp.activeDiagnostic, 'No active diagnostic set — use a "diagnostic for" Given step first');
    lsp.codeActions = createCodeActions(
      lsp.activeDiagnostic,
      lsp.changes,
      lsp.documentText,
      lsp.documentUri,
    );
  },
);

When(
  'I create diagnostics',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    lsp.diagnostics = createDiagnostics(lsp.changes, lsp.documentText);
  },
);

When(
  'I create code lenses',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    // Use 'always' mode so lenses appear without requiring cursorState
    lsp.codeLenses = createCodeLenses(lsp.changes, lsp.documentText, undefined, 'always');
  },
);

When(
  'I create document links',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    lsp.documentLinks = createDocumentLinks(lsp.documentText, lsp.documentUri);
  },
);

When(
  'I build semantic tokens',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    const result = buildSemanticTokens(lsp.changes, lsp.documentText);
    lsp.semanticTokensData = result.data;
  },
);

When(
  'I request the semantic tokens legend',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    lsp.semanticTokensLegend = getSemanticTokensLegend();
  },
);

// =============================================================================
// Then — Hover assertions
// =============================================================================

Then(
  'the hover contains {string}',
  function (this: ChangeTracksWorld, expected: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.hoverResult, 'Expected a hover result but got null');
    const contents = lsp.hoverResult.contents;
    assert.ok(typeof contents === 'object' && 'value' in contents, 'Expected MarkupContent in hover');
    assert.ok(
      contents.value.includes(expected),
      `Expected hover to contain "${expected}" but got: "${contents.value}"`,
    );
  },
);

Then(
  'there is no hover',
  function (this: ChangeTracksWorld) {
    const lsp = getLsp(this);
    assert.strictEqual(lsp.hoverResult, null, 'Expected no hover but got a result');
  },
);

// =============================================================================
// Then — Code action assertions
// =============================================================================

Then(
  'there is a quick-fix titled {string}',
  function (this: ChangeTracksWorld, title: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeActions, 'No code actions available');
    const found = lsp.codeActions.find(a => a.title === title && a.kind === CodeActionKind.QuickFix);
    assert.ok(found, `No quick-fix titled "${title}" found. Available: ${lsp.codeActions.map(a => a.title).join(', ')}`);
  },
);

Then(
  'there is no quick-fix titled {string}',
  function (this: ChangeTracksWorld, title: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeActions, 'No code actions available');
    const found = lsp.codeActions.find(a => a.title === title && a.kind === CodeActionKind.QuickFix);
    assert.ok(!found, `Found unexpected quick-fix titled "${title}"`);
  },
);

Then(
  'there is a source action titled {string}',
  function (this: ChangeTracksWorld, title: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeActions, 'No code actions available');
    const found = lsp.codeActions.find(a => a.title === title && a.kind === CodeActionKind.Source);
    assert.ok(found, `No source action titled "${title}" found. Available: ${lsp.codeActions.map(a => `${a.title}(${a.kind})`).join(', ')}`);
  },
);

Then(
  'the {string} edit replaces range {int}-{int} with {string}',
  function (this: ChangeTracksWorld, actionTitle: string, _rStart: number, _rEnd: number, _newText: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeActions, 'No code actions available');
    const action = lsp.codeActions.find(a => a.title === actionTitle);
    assert.ok(action, `No action titled "${actionTitle}". Available: ${lsp.codeActions.map(a => a.title).join(', ')}`);
    // Code actions now use Command objects (routed through extension) rather than inline edits
    assert.ok(action.command, `Action "${actionTitle}" has no command`);
    assert.ok(action.command.command, `Action "${actionTitle}" command has no command name`);
    // Verify the command has the change ID as an argument
    assert.ok(action.command.arguments && action.command.arguments.length > 0,
      `Action "${actionTitle}" command has no arguments`);
  },
);

// =============================================================================
// Then — Diagnostics assertions
// =============================================================================

Then(
  'there is {int} diagnostic',
  function (this: ChangeTracksWorld, count: number) {
    const lsp = getLsp(this);
    assert.strictEqual(lsp.diagnostics.length, count);
  },
);

Then(
  'there are {int} diagnostics',
  function (this: ChangeTracksWorld, count: number) {
    const lsp = getLsp(this);
    assert.strictEqual(lsp.diagnostics.length, count);
  },
);

Then(
  'diagnostic {int} has severity {string}',
  function (this: ChangeTracksWorld, index: number, severity: string) {
    const lsp = getLsp(this);
    const diag = lsp.diagnostics[index - 1];
    assert.ok(diag, `No diagnostic at index ${index}`);
    if (severity === 'Hint') {
      assert.strictEqual(diag.severity, DiagnosticSeverity.Hint);
    }
  },
);

Then(
  'diagnostic {int} has message {string}',
  function (this: ChangeTracksWorld, index: number, message: string) {
    const lsp = getLsp(this);
    const diag = lsp.diagnostics[index - 1];
    assert.ok(diag, `No diagnostic at index ${index}`);
    assert.strictEqual(diag.message, message);
  },
);

Then(
  'diagnostic {int} has source {string}',
  function (this: ChangeTracksWorld, index: number, source: string) {
    const lsp = getLsp(this);
    const diag = lsp.diagnostics[index - 1];
    assert.ok(diag, `No diagnostic at index ${index}`);
    assert.strictEqual(diag.source, source);
  },
);

Then(
  'diagnostic {int} message ends with {string}',
  function (this: ChangeTracksWorld, index: number, suffix: string) {
    const lsp = getLsp(this);
    const diag = lsp.diagnostics[index - 1];
    assert.ok(diag, `No diagnostic at index ${index}`);
    assert.ok(diag.message.endsWith(suffix), `Expected message to end with "${suffix}" but got: "${diag.message}"`);
  },
);

Then(
  'diagnostic {int} message is shorter than {int} characters',
  function (this: ChangeTracksWorld, index: number, maxLen: number) {
    const lsp = getLsp(this);
    const diag = lsp.diagnostics[index - 1];
    assert.ok(diag, `No diagnostic at index ${index}`);
    assert.ok(diag.message.length < maxLen, `Expected message length < ${maxLen} but got ${diag.message.length}`);
  },
);

// =============================================================================
// Then — Code lens assertions
// =============================================================================

Then(
  'there are {int} code lenses',
  function (this: ChangeTracksWorld, count: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeLenses !== undefined, 'Code lenses not created');
    assert.strictEqual(lsp.codeLenses.length, count);
  },
);

Then(
  /^there is an? "([^"]+)" lens for "([^"]+)"$/,
  function (this: ChangeTracksWorld, title: string, changeId: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeLenses, 'Code lenses not created');
    const found = lsp.codeLenses.find(
      l => l.command?.title === title && l.command?.arguments?.[0] === changeId,
    );
    assert.ok(found, `No "${title}" lens for change "${changeId}"`);
  },
);

Then(
  /^there is an? "([^"]+)" document lens$/,
  function (this: ChangeTracksWorld, title: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeLenses, 'Code lenses not created');
    const found = lsp.codeLenses.find(l => l.command?.title === title);
    assert.ok(found, `No document lens titled "${title}". Available: ${lsp.codeLenses.map(l => l.command?.title).join(', ')}`);
  },
);

Then(
  'the {string} lens for {string} is at line {int}',
  function (this: ChangeTracksWorld, title: string, changeId: string, line: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeLenses, 'Code lenses not created');
    const found = lsp.codeLenses.find(
      l => l.command?.title === title && l.command?.arguments?.[0] === changeId,
    );
    assert.ok(found, `No "${title}" lens for change "${changeId}"`);
    assert.strictEqual(found.range.start.line, line);
  },
);

Then(
  /^the "([^"]+)" document lens is at line (\d+)$/,
  function (this: ChangeTracksWorld, title: string, line: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.codeLenses, 'Code lenses not created');
    const found = lsp.codeLenses.find(l => l.command?.title === title);
    assert.ok(found, `No document lens titled "${title}"`);
    assert.strictEqual(found.range.start.line, Number(line));
  },
);

// =============================================================================
// Then — Document links assertions
// =============================================================================

Then(
  'there are {int} document links',
  function (this: ChangeTracksWorld, count: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.documentLinks !== undefined, 'Document links not created');
    assert.strictEqual(lsp.documentLinks.length, count);
  },
);

Then(
  'there is a link on line {int} targeting line {int}',
  function (this: ChangeTracksWorld, srcLine: number, targetLine: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.documentLinks, 'Document links not created');
    const link = lsp.documentLinks.find(l => l.range.start.line === srcLine);
    assert.ok(link, `No link on line ${srcLine}`);
    assert.ok(link.target, 'Link has no target');
    // Decode the target to check destination line
    const prefix = 'command:changetracks.goToPosition?';
    assert.ok(link.target.startsWith(prefix), `Unexpected target format: ${link.target}`);
    const json = decodeURIComponent(link.target.slice(prefix.length));
    const [, line] = JSON.parse(json);
    assert.strictEqual(line, targetLine);
  },
);

Then(
  'there are {int} links on line {int}',
  function (this: ChangeTracksWorld, count: number, line: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.documentLinks, 'Document links not created');
    const links = lsp.documentLinks.filter(l => l.range.start.line === line);
    assert.strictEqual(links.length, count, `Expected ${count} links on line ${line} but found ${links.length}`);
  },
);

// =============================================================================
// Then — Semantic tokens assertions
// =============================================================================

Then(
  'there are {int} semantic tokens',
  function (this: ChangeTracksWorld, count: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensData !== undefined, 'Semantic tokens not built');
    assert.strictEqual(lsp.semanticTokensData.length / 5, count);
  },
);

Then(
  'token {int} has type index {int}',
  function (this: ChangeTracksWorld, tokenIdx: number, typeIndex: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensData, 'Semantic tokens not built');
    const offset = (tokenIdx - 1) * 5;
    assert.ok(offset + 4 < lsp.semanticTokensData.length, `Token ${tokenIdx} out of range`);
    assert.strictEqual(lsp.semanticTokensData[offset + 3], typeIndex);
  },
);

Then(
  'token {int} has the proposed modifier bit set',
  function (this: ChangeTracksWorld, tokenIdx: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensData, 'Semantic tokens not built');
    const offset = (tokenIdx - 1) * 5;
    const modifiers = lsp.semanticTokensData[offset + 4];
    // proposed bit is 1<<2 = 4
    assert.strictEqual(modifiers & 4, 4, `Token ${tokenIdx}: proposed bit not set (modifiers=${modifiers})`);
  },
);

Then(
  'token {int} does not have the proposed modifier bit set',
  function (this: ChangeTracksWorld, tokenIdx: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensData, 'Semantic tokens not built');
    const offset = (tokenIdx - 1) * 5;
    const modifiers = lsp.semanticTokensData[offset + 4];
    assert.strictEqual(modifiers & 4, 0, `Token ${tokenIdx}: proposed bit should not be set (modifiers=${modifiers})`);
  },
);

Then(
  'token {int} has the accepted modifier bit set',
  function (this: ChangeTracksWorld, tokenIdx: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensData, 'Semantic tokens not built');
    const offset = (tokenIdx - 1) * 5;
    const modifiers = lsp.semanticTokensData[offset + 4];
    // accepted bit is 1<<3 = 8
    assert.strictEqual(modifiers & 8, 8, `Token ${tokenIdx}: accepted bit not set (modifiers=${modifiers})`);
  },
);

Then(
  'token {int} does not have the accepted modifier bit set',
  function (this: ChangeTracksWorld, tokenIdx: number) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensData, 'Semantic tokens not built');
    const offset = (tokenIdx - 1) * 5;
    const modifiers = lsp.semanticTokensData[offset + 4];
    assert.strictEqual(modifiers & 8, 0, `Token ${tokenIdx}: accepted bit should not be set (modifiers=${modifiers})`);
  },
);

Then(
  'the legend includes token type {string}',
  function (this: ChangeTracksWorld, tokenType: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensLegend, 'Legend not requested');
    assert.ok(
      lsp.semanticTokensLegend.tokenTypes.includes(tokenType),
      `Token type "${tokenType}" not in legend`,
    );
  },
);

Then(
  'the legend includes modifier {string}',
  function (this: ChangeTracksWorld, modifier: string) {
    const lsp = getLsp(this);
    assert.ok(lsp.semanticTokensLegend, 'Legend not requested');
    assert.ok(
      lsp.semanticTokensLegend.tokenModifiers.includes(modifier),
      `Modifier "${modifier}" not in legend`,
    );
  },
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Auto-parse simple comment/highlight changes from document text for hover tests
 * where explicit change Given steps are not used.
 */
function autoParseChanges(text: string): ChangeNode[] {
  const changes: ChangeNode[] = [];
  const patterns = [
    { re: /\{>>([^<]*?)<<\}/g, type: ChangeType.Comment },
    { re: /\{==([^=]*?)==\}/g, type: ChangeType.Highlight },
    { re: /\{\+\+([^+]*?)\+\+\}/g, type: ChangeType.Insertion },
    { re: /\{--([^-]*?)--\}/g, type: ChangeType.Deletion },
  ];

  for (const { re, type } of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const node: ChangeNode = {
        id: String(changes.length + 1),
        type,
        status: ChangeStatus.Proposed,
        range: { start: m.index, end: m.index + m[0].length },
        contentRange: { start: m.index + 3, end: m.index + 3 + m[1].length },
        level: 0,
        anchored: false,
      };
      if (type === ChangeType.Comment) {
        node.metadata = { comment: m[1] };
      }
      changes.push(node);
    }
  }

  return changes;
}
