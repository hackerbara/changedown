/**
 * Global argument parser for the `sc` CLI.
 *
 * Output flags (--json, --pretty, --quiet) and --project-dir are hoisted
 * from ANY position in argv. Only --help / -h is position-sensitive:
 * before the command token = global help, after = passed through as subArg
 * for per-command help.
 */

export type OutputFormat = 'json' | 'pretty' | 'quiet';

export interface GlobalArgs {
  command: string;
  subArgs: string[];
  outputFormat: OutputFormat;
  projectDir?: string;
}

const OUTPUT_FLAGS: Record<string, OutputFormat> = {
  '--json': 'json',
  '--pretty': 'pretty',
  '--quiet': 'quiet',
};

export function parseGlobalArgs(argv: string[]): GlobalArgs {
  let outputFormat: OutputFormat = 'json';
  let projectDir: string | undefined;

  // Pass 1: Identify which tokens are global flags and mark them consumed.
  // Also find the command token (first non-flag, non-consumed token).
  const consumed = new Set<number>();
  let commandIndex = -1;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg in OUTPUT_FLAGS) {
      outputFormat = OUTPUT_FLAGS[arg];
      consumed.add(i);
      continue;
    }

    if (arg === '--project-dir' && i + 1 < argv.length) {
      projectDir = argv[i + 1];
      consumed.add(i);
      consumed.add(i + 1);
      i++; // skip value
      continue;
    }

    // --help/-h BEFORE the command = global help
    if ((arg === '--help' || arg === '-h') && commandIndex === -1) {
      consumed.add(i);
      commandIndex = -2; // sentinel: global help triggered
      continue;
    }

    // First non-consumed, non-flag token = command
    if (commandIndex === -1 && !arg.startsWith('-')) {
      commandIndex = i;
      consumed.add(i);
    }
  }

  // Global help was triggered
  if (commandIndex === -2) {
    return { command: 'help', subArgs: [], outputFormat, projectDir };
  }

  const command = commandIndex >= 0 ? argv[commandIndex] : 'help';

  // Pass 2: collect subArgs — everything not consumed, preserving order.
  const subArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (!consumed.has(i)) {
      subArgs.push(argv[i]);
    }
  }

  return { command, subArgs, outputFormat, projectDir };
}
