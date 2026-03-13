import { World, setWorldConstructor, Before, After } from '@cucumber/cucumber';
import * as fs from 'node:fs';
import type { ImportStats, ExportStats } from '@changetracks/docx';

/**
 * Lightweight Cucumber World for DOCX import/export BDD tests.
 *
 * This avoids the full ChangeTracksWorld which depends on ScenarioContext
 * and MCP packages that are not built in the docx worktree.
 */
export class DocxWorld extends World {
  /** Path to the current DOCX fixture on disk */
  docxFixturePath: string | undefined;
  /** Markdown produced by import */
  docxImportedMarkdown: string | undefined;
  /** Stats produced by import */
  docxImportStats: ImportStats | undefined;
  /** Buffer produced by export */
  docxExportBuffer: Buffer | undefined;
  /** Stats produced by export */
  docxExportStats: ExportStats | undefined;
  /** Input markdown for export scenarios */
  docxInputMarkdown: string | undefined;
  /** Whether import succeeded */
  docxImportSucceeded: boolean = false;
  /** Whether export succeeded */
  docxExportSucceeded: boolean = false;
  /** Temp dir for round-trip files (cleaned up after scenario) */
  docxTmpDir: string | undefined;
  /** Re-imported markdown (for round-trip scenarios) */
  docxReImportedMarkdown: string | undefined;
  /** Re-imported stats (for round-trip scenarios) */
  docxReImportStats: ImportStats | undefined;
  /** Original import stats saved before re-import */
  docxOriginalImportStats: ImportStats | undefined;
  /** Error captured from a failing export attempt */
  docxLastExportError: Error | undefined;
}

setWorldConstructor(DocxWorld);

Before(function (this: DocxWorld) {
  this.docxFixturePath = undefined;
  this.docxImportedMarkdown = undefined;
  this.docxImportStats = undefined;
  this.docxExportBuffer = undefined;
  this.docxExportStats = undefined;
  this.docxInputMarkdown = undefined;
  this.docxImportSucceeded = false;
  this.docxExportSucceeded = false;
  this.docxTmpDir = undefined;
  this.docxReImportedMarkdown = undefined;
  this.docxReImportStats = undefined;
  this.docxOriginalImportStats = undefined;
  this.docxLastExportError = undefined;
});

After(function (this: DocxWorld) {
  if (this.docxTmpDir) {
    fs.rmSync(this.docxTmpDir, { recursive: true, force: true });
    this.docxTmpDir = undefined;
  }
});
