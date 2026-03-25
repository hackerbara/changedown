import * as fs from 'node:fs';
import * as path from 'node:path';
import { exportDocx } from '@changetracks/docx';
import type { ExportOptions, ExportMode, CommentMode } from '@changetracks/docx';

export interface ExportCliOptions {
  output?: string;
  mode?: string;
  comments?: string;
}

export async function handleExport(
  file: string,
  opts: ExportCliOptions
): Promise<void> {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const markdown = fs.readFileSync(file, 'utf-8');

  const mode = (opts.mode ?? 'tracked') as ExportMode;
  const comments = (opts.comments ?? 'all') as CommentMode;

  const exportOpts: ExportOptions = {
    mode,
    comments,
    mediaDir: path.dirname(path.resolve(file)),
  };

  const { buffer, stats } = await exportDocx(markdown, exportOpts);

  const baseName = path.basename(file, path.extname(file));
  const outputPath = opts.output ?? `${baseName}.docx`;

  fs.writeFileSync(outputPath, buffer);

  const totalChanges = stats.insertions + stats.deletions + stats.substitutions;
  console.log(`Exported: ${file} -> ${outputPath}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Changes: ${totalChanges} (${stats.insertions} ins, ${stats.deletions} del, ${stats.substitutions} sub)`);
  console.log(`  Comments: ${stats.comments}`);
  console.log(`  File size: ${(stats.fileSize / 1024).toFixed(1)} KB`);
  if (stats.authors.length > 0) {
    console.log(`  Authors: ${stats.authors.join(', ')}`);
  }
}
