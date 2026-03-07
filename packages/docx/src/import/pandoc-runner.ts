import { execFileSync, execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PandocResult {
  ast: PandocAst;
}

export interface PandocAst {
  'pandoc-api-version': number[];
  meta: Record<string, unknown>;
  blocks: PandocBlock[];
}

export interface PandocBlock {
  t: string;
  c: any;
}

export interface PandocInline {
  t: string;
  c: any;
}

// ---------------------------------------------------------------------------
// Find pandoc binary
// ---------------------------------------------------------------------------

export function findPandoc(customPath?: string): string {
  if (customPath) {
    // Verify custom path exists by trying to run it (execFileSync avoids shell injection)
    try {
      execFileSync(customPath, ['--version'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return customPath;
    } catch {
      throw new Error(`Pandoc not found at custom path: ${customPath}`);
    }
  }

  // Try to find pandoc on PATH
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${which} pandoc`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.trim().split('\n')[0];
  } catch {
    throw new Error(
      'Pandoc not found on PATH. Install pandoc: https://pandoc.org/installing.html'
    );
  }
}

// ---------------------------------------------------------------------------
// Run pandoc
// ---------------------------------------------------------------------------

export function runPandoc(docxPath: string, pandocPath?: string): PandocResult {
  const pandoc = findPandoc(pandocPath);

  let stdout: string;
  try {
    // execFileSync avoids shell injection — arguments passed as array, not string
    stdout = execFileSync(pandoc, ['--track-changes=all', docxPath, '-t', 'json'], {
      maxBuffer: 50 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    const message = err.stderr?.toString() || err.message || 'Unknown error';
    throw new Error(`Pandoc failed: ${message}`);
  }

  let ast: PandocAst;
  try {
    ast = JSON.parse(stdout);
  } catch {
    throw new Error('Failed to parse pandoc JSON output');
  }

  return { ast };
}
