import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { importDocx, exportDocx } from '@changetracks/docx';
import type { ExportMode } from '@changetracks/docx';
import JSZip from 'jszip';
import { DocxWorld } from './docx-world.js';

// ---------------------------------------------------------------------------
// Fixture resolution
// ---------------------------------------------------------------------------

function fixtureDir(): string {
  // import.meta.url points to this file:
  //   packages/tests/features/steps/docx.steps.ts
  // We need to reach: docs/test-fixtures/ at the repo root.
  // URL resolution is relative to the file's directory, so ../../../../../
  // goes: steps/ -> features/ -> tests/ -> packages/ -> repo-root/
  return new URL('../../../../docs/test-fixtures', import.meta.url).pathname;
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

Given('pandoc is available on PATH', function () {
  try {
    execSync('pandoc --version', { stdio: 'pipe' });
  } catch {
    assert.fail('pandoc is not installed or not on PATH');
  }
});

// ---------------------------------------------------------------------------
// Given steps
// ---------------------------------------------------------------------------

Given(
  'a DOCX fixture {string}',
  function (this: DocxWorld, name: string) {
    const p = path.join(fixtureDir(), name);
    assert.ok(fs.existsSync(p), `Fixture not found: ${p}`);
    this.docxFixturePath = p;
  },
);

Given(
  'CriticMarkup markdown:',
  function (this: DocxWorld, docString: string) {
    this.docxInputMarkdown = docString;
  },
);

// ---------------------------------------------------------------------------
// When steps -- Import
// ---------------------------------------------------------------------------

When(
  'I import the DOCX file',
  async function (this: DocxWorld) {
    assert.ok(this.docxFixturePath, 'No DOCX fixture path set');
    const { markdown, stats } = await importDocx(this.docxFixturePath);
    this.docxImportedMarkdown = markdown;
    this.docxImportStats = stats;
    this.docxImportSucceeded = true;
  },
);

When(
  'I import the DOCX file with comments enabled',
  async function (this: DocxWorld) {
    assert.ok(this.docxFixturePath, 'No DOCX fixture path set');
    const { markdown, stats } = await importDocx(this.docxFixturePath, {
      comments: true,
    });
    this.docxImportedMarkdown = markdown;
    this.docxImportStats = stats;
    this.docxImportSucceeded = true;
  },
);

When(
  'I import the DOCX file with comments disabled',
  async function (this: DocxWorld) {
    assert.ok(this.docxFixturePath, 'No DOCX fixture path set');
    const { markdown, stats } = await importDocx(this.docxFixturePath, {
      comments: false,
    });
    this.docxImportedMarkdown = markdown;
    this.docxImportStats = stats;
    this.docxImportSucceeded = true;
  },
);

When(
  'I import the DOCX file with substitution merging enabled',
  async function (this: DocxWorld) {
    assert.ok(this.docxFixturePath, 'No DOCX fixture path set');
    const { markdown, stats } = await importDocx(this.docxFixturePath, {
      mergeSubstitutions: true,
    });
    this.docxImportedMarkdown = markdown;
    this.docxImportStats = stats;
    this.docxImportSucceeded = true;
  },
);

// ---------------------------------------------------------------------------
// When steps -- Export
// ---------------------------------------------------------------------------

When(
  'I export to DOCX with mode {string}',
  async function (this: DocxWorld, mode: string) {
    const md = this.docxInputMarkdown ?? '';
    const { buffer, stats } = await exportDocx(md, {
      mode: mode as ExportMode,
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

When(
  'I export to DOCX with Word Online compatibility',
  async function (this: DocxWorld) {
    const md = this.docxInputMarkdown ?? '';
    const { buffer, stats } = await exportDocx(md, {
      mode: 'tracked',
      wordOnlineCompat: true,
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

// ---------------------------------------------------------------------------
// When steps -- Round-trip
// ---------------------------------------------------------------------------

When(
  'I export the imported markdown to DOCX with mode {string}',
  async function (this: DocxWorld, mode: string) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown available');
    // Save original import stats before continuing
    this.docxOriginalImportStats = this.docxImportStats;
    const { buffer, stats } = await exportDocx(this.docxImportedMarkdown, {
      mode: mode as ExportMode,
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

When(
  'I import the exported DOCX file',
  async function (this: DocxWorld) {
    assert.ok(this.docxExportBuffer, 'No exported DOCX buffer available');
    // Write buffer to a temp file so importDocx can read it
    if (!this.docxTmpDir) {
      this.docxTmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'ct-docx-bdd-'),
      );
    }
    const tmpDocx = path.join(this.docxTmpDir, 'exported.docx');
    fs.writeFileSync(tmpDocx, this.docxExportBuffer);
    const { markdown, stats } = await importDocx(tmpDocx);
    this.docxReImportedMarkdown = markdown;
    this.docxReImportStats = stats;
  },
);

// ---------------------------------------------------------------------------
// When steps -- Export (extended)
// ---------------------------------------------------------------------------

When(
  'I export to DOCX with mode {string} and title {string}',
  async function (this: DocxWorld, mode: string, title: string) {
    const md = this.docxInputMarkdown ?? '';
    const { buffer, stats } = await exportDocx(md, {
      mode: mode as ExportMode,
      title,
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

When(
  'I export to DOCX with mode {string} and comments {string}',
  async function (this: DocxWorld, mode: string, comments: string) {
    const md = this.docxInputMarkdown ?? '';
    const { buffer, stats } = await exportDocx(md, {
      mode: mode as ExportMode,
      comments: comments as 'all' | 'none' | 'unresolved',
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

When(
  'I export to DOCX without Word Online compatibility',
  async function (this: DocxWorld) {
    const md = this.docxInputMarkdown ?? '';
    const { buffer, stats } = await exportDocx(md, {
      mode: 'tracked',
      wordOnlineCompat: false,
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

When(
  'I export to DOCX with Word Online compatibility and comments {string}',
  async function (this: DocxWorld, comments: string) {
    const md = this.docxInputMarkdown ?? '';
    const { buffer, stats } = await exportDocx(md, {
      mode: 'tracked',
      wordOnlineCompat: true,
      comments: comments as 'all' | 'none' | 'unresolved',
    });
    this.docxExportBuffer = buffer;
    this.docxExportStats = stats;
    this.docxExportSucceeded = true;
  },
);

// ---------------------------------------------------------------------------
// When steps -- Export (error paths)
// ---------------------------------------------------------------------------

When(
  'I try to export to DOCX with mode {string}',
  async function (this: DocxWorld, mode: string) {
    const md = this.docxInputMarkdown ?? '';
    try {
      await exportDocx(md, { mode: mode as ExportMode });
      this.docxExportSucceeded = true;
    } catch (err: any) {
      this.docxLastExportError = err;
      this.docxExportSucceeded = false;
    }
  },
);

When(
  'I try to export to DOCX with mode {string} and comments {string}',
  async function (this: DocxWorld, mode: string, comments: string) {
    const md = this.docxInputMarkdown ?? '';
    try {
      await exportDocx(md, {
        mode: mode as ExportMode,
        comments: comments as 'all' | 'none' | 'unresolved',
      });
      this.docxExportSucceeded = true;
    } catch (err: any) {
      this.docxLastExportError = err;
      this.docxExportSucceeded = false;
    }
  },
);

// ---------------------------------------------------------------------------
// When steps -- Import (extended)
// ---------------------------------------------------------------------------

When(
  'I import the DOCX file with substitution merging disabled',
  async function (this: DocxWorld) {
    assert.ok(this.docxFixturePath, 'No DOCX fixture path set');
    const { markdown, stats } = await importDocx(this.docxFixturePath, {
      mergeSubstitutions: false,
    });
    this.docxImportedMarkdown = markdown;
    this.docxImportStats = stats;
    this.docxImportSucceeded = true;
  },
);

// ---------------------------------------------------------------------------
// Given steps (extended)
// ---------------------------------------------------------------------------

Given(
  'CriticMarkup markdown with {int} insertions',
  function (this: DocxWorld, count: number) {
    const lines: string[] = [];
    const footnotes: string[] = [];
    for (let i = 1; i <= count; i++) {
      lines.push(`Word{++ins${i}++}[^ct-${i}]`);
      footnotes.push(`[^ct-${i}]: @alice | 2026-01-15 | ins | proposed`);
    }
    this.docxInputMarkdown = lines.join(' ') + '\n\n' + footnotes.join('\n');
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Import assertions
// ---------------------------------------------------------------------------

Then('the import succeeds', function (this: DocxWorld) {
  assert.ok(this.docxImportSucceeded, 'Import did not succeed');
  assert.ok(this.docxImportedMarkdown !== undefined, 'No markdown produced');
  assert.ok(this.docxImportStats !== undefined, 'No import stats produced');
});

Then(
  'the markdown contains CriticMarkup insertions',
  function (this: DocxWorld) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    assert.ok(
      this.docxImportedMarkdown.includes('{++'),
      `Expected markdown to contain CriticMarkup insertions but got:\n${this.docxImportedMarkdown.slice(0, 500)}`,
    );
  },
);

Then(
  'the import stats show at least {int} tracked change',
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxImportStats, 'No import stats');
    const total =
      this.docxImportStats.insertions +
      this.docxImportStats.deletions +
      this.docxImportStats.substitutions;
    assert.ok(
      total >= min,
      `Expected at least ${min} tracked change(s), got ${total}`,
    );
  },
);

Then(
  'the import stats show at least {int} comment',
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxImportStats, 'No import stats');
    assert.ok(
      this.docxImportStats.comments >= min,
      `Expected at least ${min} comment(s), got ${this.docxImportStats.comments}`,
    );
  },
);

Then(
  'the import stats show {int} comments',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxImportStats, 'No import stats');
    assert.equal(this.docxImportStats.comments, expected);
  },
);

Then(
  'the import stats show at least {int} substitution',
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxImportStats, 'No import stats');
    assert.ok(
      this.docxImportStats.substitutions >= min,
      `Expected at least ${min} substitution(s), got ${this.docxImportStats.substitutions}`,
    );
  },
);

Then(
  'the markdown contains footnote definitions matching {string}',
  function (this: DocxWorld, pattern: string) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    assert.ok(
      this.docxImportedMarkdown.includes(pattern),
      `Expected markdown to contain "${pattern}"`,
    );
  },
);

Then(
  'each tracked change has a corresponding footnote',
  function (this: DocxWorld) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    // Count inline references like [^ct-1], [^ct-2], etc.
    const inlineRefs =
      this.docxImportedMarkdown.match(/\[\^ct-\d+\](?!:)/g) || [];
    // Count footnote definitions like [^ct-1]:
    const footnoteDefs =
      this.docxImportedMarkdown.match(/^\[\^ct-\d+\]:/gm) || [];

    // Each inline reference should have a definition
    const defIds = new Set(
      footnoteDefs.map((d) => d.replace(':', '')),
    );
    for (const ref of inlineRefs) {
      assert.ok(
        defIds.has(ref),
        `Inline reference ${ref} has no corresponding footnote definition`,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Export assertions
// ---------------------------------------------------------------------------

Then('the export succeeds', function (this: DocxWorld) {
  assert.ok(this.docxExportSucceeded, 'Export did not succeed');
  assert.ok(this.docxExportBuffer, 'No export buffer produced');
});

Then('the DOCX is a valid ZIP file', async function (this: DocxWorld) {
  assert.ok(this.docxExportBuffer, 'No export buffer');
  const zip = await JSZip.loadAsync(this.docxExportBuffer);
  const docXml = zip.file('word/document.xml');
  assert.ok(docXml, 'ZIP does not contain word/document.xml');
});

Then(
  'the DOCX document.xml contains {string}',
  async function (this: DocxWorld, expected: string) {
    assert.ok(this.docxExportBuffer, 'No export buffer');
    const zip = await JSZip.loadAsync(this.docxExportBuffer);
    const docXml = zip.file('word/document.xml');
    assert.ok(docXml, 'ZIP does not contain word/document.xml');
    const content = await docXml.async('string');
    assert.ok(
      content.includes(expected),
      `Expected document.xml to contain "${expected}"`,
    );
  },
);

Then(
  'the DOCX document.xml does not contain {string}',
  async function (this: DocxWorld, unexpected: string) {
    assert.ok(this.docxExportBuffer, 'No export buffer');
    const zip = await JSZip.loadAsync(this.docxExportBuffer);
    const docXml = zip.file('word/document.xml');
    assert.ok(docXml, 'ZIP does not contain word/document.xml');
    const content = await docXml.async('string');
    assert.ok(
      !content.includes(unexpected),
      `Expected document.xml NOT to contain "${unexpected}"`,
    );
  },
);

Then(
  'the export stats show {int} insertion and {int} deletion',
  function (this: DocxWorld, ins: number, del: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.equal(this.docxExportStats.insertions, ins);
    assert.equal(this.docxExportStats.deletions, del);
  },
);

Then(
  'the export stats show {int} insertion',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.equal(this.docxExportStats.insertions, expected);
  },
);

Then(
  'the export stats show {int} insertions',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.equal(this.docxExportStats.insertions, expected);
  },
);

Then(
  'the export stats show {int} deletions',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.equal(this.docxExportStats.deletions, expected);
  },
);

Then(
  'the export stats list author {string}',
  function (this: DocxWorld, expectedAuthor: string) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.ok(
      this.docxExportStats.authors.includes(expectedAuthor),
      `Expected authors to include "${expectedAuthor}", got: [${this.docxExportStats.authors.join(', ')}]`,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Round-trip assertions
// ---------------------------------------------------------------------------

Then(
  'the original and re-imported change counts match',
  function (this: DocxWorld) {
    assert.ok(this.docxOriginalImportStats, 'No original import stats');
    assert.ok(this.docxReImportStats, 'No re-imported stats');

    const originalTotal =
      this.docxOriginalImportStats.insertions +
      this.docxOriginalImportStats.deletions +
      this.docxOriginalImportStats.substitutions;
    const reImportTotal =
      this.docxReImportStats.insertions +
      this.docxReImportStats.deletions +
      this.docxReImportStats.substitutions;

    // Allow ±1 tolerance: DOCX round-trip can merge adjacent del+ins from
    // the same author into a single sub, reducing total count by 1.
    const diff = Math.abs(reImportTotal - originalTotal);
    assert.ok(
      diff <= 1,
      `Original total: ${originalTotal}, re-imported total: ${reImportTotal} (diff ${diff} exceeds ±1 tolerance)`,
    );
  },
);

Then(
  'the re-imported markdown contains {string}',
  function (this: DocxWorld, expected: string) {
    assert.ok(this.docxReImportedMarkdown, 'No re-imported markdown');
    assert.ok(
      this.docxReImportedMarkdown.includes(expected),
      `Expected re-imported markdown to contain "${expected}"`,
    );
  },
);

Then(
  /^the re-imported stats show at least (\d+) insertions?$/,
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxReImportStats, 'No re-imported stats');
    assert.ok(
      this.docxReImportStats.insertions >= min,
      `Expected at least ${min} insertion(s), got ${this.docxReImportStats.insertions}`,
    );
  },
);

Then(
  /^the re-imported stats show at least (\d+) deletions?$/,
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxReImportStats, 'No re-imported stats');
    assert.ok(
      this.docxReImportStats.deletions >= min,
      `Expected at least ${min} deletion(s), got ${this.docxReImportStats.deletions}`,
    );
  },
);

Then(
  'the re-imported stats show at least {int} comment',
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxReImportStats, 'No re-imported stats');
    assert.ok(
      this.docxReImportStats.comments >= min,
      `Expected at least ${min} comment(s), got ${this.docxReImportStats.comments}`,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps -- DOCX ZIP introspection
// ---------------------------------------------------------------------------

Then(
  'the DOCX contains file {string}',
  async function (this: DocxWorld, filePath: string) {
    assert.ok(this.docxExportBuffer, 'No export buffer');
    const zip = await JSZip.loadAsync(this.docxExportBuffer);
    const entry = zip.file(filePath);
    assert.ok(entry, `Expected DOCX to contain "${filePath}"`);
  },
);

Then(
  'the DOCX file {string} contains {string}',
  async function (this: DocxWorld, filePath: string, expected: string) {
    assert.ok(this.docxExportBuffer, 'No export buffer');
    const zip = await JSZip.loadAsync(this.docxExportBuffer);
    const entry = zip.file(filePath);
    assert.ok(entry, `DOCX does not contain "${filePath}"`);
    const content = await entry.async('string');
    assert.ok(
      content.includes(expected),
      `Expected "${filePath}" to contain "${expected}"`,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Export stats (extended)
// ---------------------------------------------------------------------------

Then(
  'the export stats show at least {int} comments',
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.ok(
      this.docxExportStats.comments >= min,
      `Expected at least ${min} comment(s), got ${this.docxExportStats.comments}`,
    );
  },
);

Then(
  'the export stats show {int} comments',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.equal(this.docxExportStats.comments, expected);
  },
);

Then(
  'the export stats show {int} deletion',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxExportStats, 'No export stats');
    assert.equal(this.docxExportStats.deletions, expected);
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Import assertions (extended)
// ---------------------------------------------------------------------------

Then(
  'the import stats list at least {int} author',
  function (this: DocxWorld, min: number) {
    assert.ok(this.docxImportStats, 'No import stats');
    assert.ok(
      this.docxImportStats.authors.length >= min,
      `Expected at least ${min} author(s), got ${this.docxImportStats.authors.length}`,
    );
  },
);

Then(
  'the import stats authors are unique',
  function (this: DocxWorld) {
    assert.ok(this.docxImportStats, 'No import stats');
    const authors = this.docxImportStats.authors;
    const unique = new Set(authors);
    assert.equal(
      unique.size,
      authors.length,
      `Authors list contains duplicates: [${authors.join(', ')}]`,
    );
  },
);

Then(
  'the import stats show {int} substitutions',
  function (this: DocxWorld, expected: number) {
    assert.ok(this.docxImportStats, 'No import stats');
    assert.equal(this.docxImportStats.substitutions, expected);
  },
);

Then(
  'the imported markdown contains {string}',
  function (this: DocxWorld, expected: string) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    assert.ok(
      this.docxImportedMarkdown.includes(expected),
      `Expected imported markdown to contain "${expected}"`,
    );
  },
);

Then(
  'the imported markdown footnotes contain type {string} or {string} or {string}',
  function (this: DocxWorld, type1: string, type2: string, type3: string) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    const footnoteLines = this.docxImportedMarkdown
      .split('\n')
      .filter((l) => /^\[\^ct-\d+\]:/.test(l));
    assert.ok(footnoteLines.length > 0, 'No footnote definitions found');
    const validTypes = new Set([type1, type2, type3]);
    for (const line of footnoteLines) {
      const typeMatch = line.match(/\|\s*(ins|del|sub|highlight|comment)\s*\|/);
      assert.ok(typeMatch, `Footnote line has no type field: ${line}`);
      assert.ok(
        validTypes.has(typeMatch[1]),
        `Footnote type "${typeMatch[1]}" not in [${[...validTypes].join(', ')}]: ${line}`,
      );
    }
  },
);

Then(
  'the imported markdown footnotes contain type {string} or {string} or {string} or {string}',
  function (this: DocxWorld, type1: string, type2: string, type3: string, type4: string) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    const footnoteLines = this.docxImportedMarkdown
      .split('\n')
      .filter((l) => /^\[\^ct-\d+\]:/.test(l));
    assert.ok(footnoteLines.length > 0, 'No footnote definitions found');
    const validTypes = new Set([type1, type2, type3, type4]);
    for (const line of footnoteLines) {
      const typeMatch = line.match(/\|\s*(ins|del|sub|highlight|comment)\s*\|/);
      assert.ok(typeMatch, `Footnote line has no type field: ${line}`);
      assert.ok(
        validTypes.has(typeMatch[1]),
        `Footnote type "${typeMatch[1]}" not in [${[...validTypes].join(', ')}]: ${line}`,
      );
    }
  },
);

Then(
  'the imported markdown footnotes all have status {string}',
  function (this: DocxWorld, expectedStatus: string) {
    assert.ok(this.docxImportedMarkdown, 'No imported markdown');
    const footnoteLines = this.docxImportedMarkdown
      .split('\n')
      .filter((l) => /^\[\^ct-\d+\]:/.test(l));
    assert.ok(footnoteLines.length > 0, 'No footnote definitions found');
    for (const line of footnoteLines) {
      const statusMatch = line.match(/\|\s*(proposed|accepted|rejected)\s*$/);
      assert.ok(statusMatch, `Footnote line has no status field: ${line}`);
      assert.equal(
        statusMatch[1],
        expectedStatus,
        `Expected status "${expectedStatus}", got "${statusMatch[1]}" in: ${line}`,
      );
    }
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Error assertions
// ---------------------------------------------------------------------------

Then(
  'the export fails with error containing {string}',
  function (this: DocxWorld, expected: string) {
    assert.ok(!this.docxExportSucceeded, 'Export should have failed but succeeded');
    assert.ok(this.docxLastExportError, 'No export error captured');
    assert.ok(
      this.docxLastExportError.message.includes(expected),
      `Expected error to contain "${expected}", got: "${this.docxLastExportError.message}"`,
    );
  },
);

// ---------------------------------------------------------------------------
// Then steps -- Round-trip assertions (extended)
// ---------------------------------------------------------------------------

Then(
  'the re-imported stats list author matching {string} or {string}',
  function (this: DocxWorld, pattern1: string, pattern2: string) {
    assert.ok(this.docxReImportStats, 'No re-imported stats');
    const authors = this.docxReImportStats.authors;
    const found = authors.some(
      (a) =>
        a.toLowerCase().includes(pattern1.toLowerCase()) ||
        a.toLowerCase().includes(pattern2.toLowerCase()),
    );
    assert.ok(
      found,
      `Expected re-imported authors to include "${pattern1}" or "${pattern2}", got: [${authors.join(', ')}]`,
    );
  },
);

