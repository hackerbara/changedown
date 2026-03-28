import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveIdentity } from './identity.js';
import {
  generateDefaultConfig,
  parseConfigSummary,
} from './config.js';
import { detectAgents, configureAgents } from './agents.js';
import { copyExamples } from './examples.js';
import {
  ensureGitignoreEntries,
  createGitignore,
  hasGitignore,
} from './gitignore.js';
import { detectEnvironment, type EnvironmentInfo } from './environment.js';

// ---------------------------------------------------------------------------
// Dependency injection interfaces
// ---------------------------------------------------------------------------

export interface ClackAdapter {
  intro(text: string): void;
  outro(text: string): void;
  cancel(text: string): void;
  text(opts: {
    message: string;
    initialValue?: string;
    placeholder?: string;
  }): Promise<string | symbol>;
  select<T>(opts: {
    message: string;
    options: Array<{ value: T; label: string; hint?: string }>;
    initialValue?: T;
  }): Promise<T | symbol>;
  confirm(opts: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean | symbol>;
  log: {
    info(text: string): void;
    success(text: string): void;
    warn(text: string): void;
  };
  note(text: string, title?: string): void;
  isCancel(value: unknown): value is symbol;
}

export interface RunInitOptions {
  args: string[];
  projectDir: string;
  clack: ClackAdapter;
  exit?: (code: number) => void;
  log?: (msg: string) => void;
  detectEnvironmentFn?: () => EnvironmentInfo;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runInit(opts: RunInitOptions): Promise<void> {
  const { args: initArgs, projectDir, clack } = opts;
  const log = opts.log ?? console.log;

  const nonInteractive = initArgs.includes('--yes');
  const reconfigure = initArgs.includes('--reconfigure');
  const authorFlag = initArgs.find(a => a.startsWith('--author='))?.slice('--author='.length);
  const agentsFlag = initArgs.find(a => a.startsWith('--agents='))?.slice('--agents='.length);
  const policyFlag = initArgs.find(a => a.startsWith('--policy='))?.slice('--policy='.length) as
    | 'safety-net' | 'strict' | 'permissive' | undefined;

  const configDir = path.join(projectDir, '.changedown');
  const configPath = path.join(configDir, 'config.toml');

  // Re-init guard
  if (fs.existsSync(configPath) && !reconfigure) {
    const summary = parseConfigSummary(projectDir);
    if (nonInteractive) {
      log('  ChangeDown is already configured in this project.');
      log(`  Config: ${configPath}`);
      if (summary) {
        log(`  Author:   ${summary.author}`);
        log(`  Tracking: ${summary.tracking}`);
        log(`  Policy:   ${summary.policy}`);
        log(`  Protocol: ${summary.protocol}`);
      }
      log('  Run with --reconfigure to update settings.');
      return;
    }

    clack.intro('ChangeDown — durable change tracking for editors and AI agents');
    if (summary) {
      clack.log.info([
        `Already configured: ${configPath}`,
        `  Author:   ${summary.author}`,
        `  Tracking: ${summary.tracking}`,
        `  Policy:   ${summary.policy}`,
        `  Protocol: ${summary.protocol}`,
      ].join('\n'));
    } else {
      clack.log.info(`Already configured: ${configPath}`);
    }
    clack.log.info('Run changedown init --reconfigure to update settings.');
    clack.outro('Nothing changed.');
    return;
  }

  if (nonInteractive) {
    await runNonInteractive({
      projectDir, configDir, configPath,
      authorFlag, agentsFlag, policyFlag,
      log,
    });
    return;
  }

  await runInteractive({
    projectDir, configDir, configPath,
    agentsFlag,
    clack,
    exit: opts.exit,
    detectEnvironmentFn: opts.detectEnvironmentFn,
  });
}

// ---------------------------------------------------------------------------
// Non-interactive path
// ---------------------------------------------------------------------------

interface NonInteractiveOptions {
  projectDir: string;
  configDir: string;
  configPath: string;
  authorFlag: string | undefined;
  agentsFlag: string | undefined;
  policyFlag: 'safety-net' | 'strict' | 'permissive' | undefined;
  log: (msg: string) => void;
}

async function runNonInteractive(opts: NonInteractiveOptions): Promise<void> {
  const { projectDir, configDir, configPath, authorFlag, agentsFlag, policyFlag, log } = opts;

  const author = authorFlag || resolveIdentity(projectDir);
  const configToml = generateDefaultConfig({
    author,
    policyMode: policyFlag,
  });
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, configToml, 'utf8');
  await copyExamples(projectDir);

  // Gitignore handling
  if (hasGitignore(projectDir)) {
    const result = ensureGitignoreEntries(projectDir);
    if (result.action === 'appended') {
      log('  Updated .gitignore with ChangeDown entries.');
    }
  } else {
    createGitignore(projectDir);
    log('  Created .gitignore with ChangeDown entries.');
  }

  // Configure agents
  let agents = detectAgents();
  if (agentsFlag) {
    const requested = agentsFlag.split(',').map(s => s.trim());
    agents = agents.filter(a => requested.includes(a.name));
  }
  const detected = agents.filter(a => a.detected);
  if (detected.length > 0) {
    const results = await configureAgents(projectDir, detected);
    for (const r of results) {
      log(`  ${r}`);
    }
  }

  log('  ChangeDown initialized.');
}

// ---------------------------------------------------------------------------
// Interactive path
// ---------------------------------------------------------------------------

interface InteractiveOptions {
  projectDir: string;
  configDir: string;
  configPath: string;
  agentsFlag: string | undefined;
  clack: ClackAdapter;
  exit?: (code: number) => void;
  detectEnvironmentFn?: () => EnvironmentInfo;
}

async function runInteractive(opts: InteractiveOptions): Promise<void> {
  const { projectDir, configDir, configPath, agentsFlag, clack } = opts;
  const exit = opts.exit ?? process.exit;

  clack.intro('ChangeDown — durable change tracking for editors and AI agents');

  // ── Step 1: Author identity ──────────────────────────────────────────
  const detectedAuthor = resolveIdentity(projectDir);
  const author = await clack.text({
    message: 'Author identity',
    initialValue: detectedAuthor,
    placeholder: detectedAuthor,
  });
  if (clack.isCancel(author)) { clack.cancel('Setup cancelled.'); exit(0); return; }

  // ── Step 2: Tracking scope ───────────────────────────────────────────
  const trackingPattern = await clack.text({
    message: 'Which files should be tracked?',
    initialValue: '**/*.md',
    placeholder: '**/*.md',
  });
  if (clack.isCancel(trackingPattern)) { clack.cancel('Setup cancelled.'); exit(0); return; }

  // ── Step 3: Policy mode ──────────────────────────────────────────────
  const policyMode = await clack.select({
    message: 'Policy mode — how strictly should agents follow the protocol?',
    options: [
      { value: 'safety-net' as const, label: 'Safety net', hint: 'warn on protocol violations (recommended)' },
      { value: 'strict' as const, label: 'Strict', hint: 'block protocol violations' },
      { value: 'permissive' as const, label: 'Permissive', hint: 'no enforcement, agents self-govern' },
    ],
    initialValue: 'safety-net' as const,
  });
  if (clack.isCancel(policyMode)) { clack.cancel('Setup cancelled.'); exit(0); return; }

  // ── Step 4: Author enforcement ───────────────────────────────────────
  const authorEnforcement = await clack.select({
    message: 'Require author identity on changes?',
    options: [
      { value: 'optional' as const, label: 'Optional', hint: 'changes work without author attribution' },
      { value: 'required' as const, label: 'Required', hint: 'every change must identify its author' },
    ],
    initialValue: 'optional' as const,
  });
  if (clack.isCancel(authorEnforcement)) { clack.cancel('Setup cancelled.'); exit(0); return; }

  // ── Step 5: Reasoning requirement ────────────────────────────────────
  const reasoning = await clack.select({
    message: 'Require reasoning annotations on changes?',
    options: [
      { value: 'optional' as const, label: 'Optional', hint: 'agents can skip {>>reason<<} annotations' },
      { value: 'required' as const, label: 'Required', hint: 'every change must include reasoning' },
    ],
    initialValue: 'optional' as const,
  });
  if (clack.isCancel(reasoning)) { clack.cancel('Setup cancelled.'); exit(0); return; }

  // ── Step 6: Agent detection ──────────────────────────────────────────
  let agents = detectAgents();
  if (agentsFlag) {
    const requested = agentsFlag.split(',').map(s => s.trim());
    agents = agents.filter(a => requested.includes(a.name));
  }
  const detectedNames = agents.filter(a => a.detected).map(a => a.name);
  if (detectedNames.length > 0) {
    const configureResult = await clack.confirm({
      message: `Detected agents: ${detectedNames.join(', ')}. Configure them?`,
      initialValue: true,
    });
    if (!clack.isCancel(configureResult) && configureResult) {
      const results = await configureAgents(projectDir, agents.filter(a => a.detected));
      for (const r of results) {
        clack.log.success(r);
      }
    }
  }

  // ── Step 7: Advanced settings ────────────────────────────────────────
  let protocolMode: 'classic' | 'compact' = 'classic';
  let defaultView: 'review' | 'changes' | 'settled' = 'review';
  let autoSettleApprove = true;
  let autoSettleReject = true;

  const showAdvanced = await clack.confirm({
    message: 'Configure advanced settings? (protocol mode, default view, auto-settle)',
    initialValue: false,
  });
  if (clack.isCancel(showAdvanced)) { clack.cancel('Setup cancelled.'); exit(0); return; }

  if (showAdvanced) {
    const protocolResult = await clack.select({
      message: 'Protocol mode — how agents address changes',
      options: [
        { value: 'classic' as const, label: 'Classic', hint: 'old_text/new_text — natural for agents, no learning curve' },
        { value: 'compact' as const, label: 'Compact', hint: 'at+op with hash coordinates — precise, concise' },
      ],
      initialValue: 'classic' as const,
    });
    if (clack.isCancel(protocolResult)) { clack.cancel('Setup cancelled.'); exit(0); return; }
    protocolMode = protocolResult;

    const viewResult = await clack.select({
      message: 'Default view — what agents see when reading files',
      options: [
        { value: 'review' as const, label: 'Review', hint: 'full markup with inline annotations (recommended)' },
        { value: 'changes' as const, label: 'Changes', hint: 'clean prose with P/A awareness flags' },
        { value: 'settled' as const, label: 'Settled', hint: 'final text with all changes applied' },
      ],
      initialValue: 'review' as const,
    });
    if (clack.isCancel(viewResult)) { clack.cancel('Setup cancelled.'); exit(0); return; }
    defaultView = viewResult;

    const settleApproveResult = await clack.confirm({
      message: 'Auto-settle changes on approve? (compact inline markup)',
      initialValue: true,
    });
    if (clack.isCancel(settleApproveResult)) { clack.cancel('Setup cancelled.'); exit(0); return; }
    autoSettleApprove = settleApproveResult;

    const settleRejectResult = await clack.confirm({
      message: 'Auto-settle changes on reject? (remove rejected text)',
      initialValue: true,
    });
    if (clack.isCancel(settleRejectResult)) { clack.cancel('Setup cancelled.'); exit(0); return; }
    autoSettleReject = settleRejectResult;
  }

  // ── Generate config ──────────────────────────────────────────────────
  const configToml = generateDefaultConfig({
    author: author as string,
    trackingInclude: [(trackingPattern as string) || '**/*.md'],
    authorEnforcement: authorEnforcement as 'optional' | 'required',
    policyMode: policyMode as 'safety-net' | 'strict' | 'permissive',
    policyDefaultView: defaultView,
    protocolMode,
    protocolReasoning: reasoning as 'optional' | 'required',
    autoSettleOnApprove: autoSettleApprove,
    autoSettleOnReject: autoSettleReject,
  });
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, configToml, 'utf8');
  clack.log.success('Created .changedown/config.toml');

  // ── Examples ─────────────────────────────────────────────────────────
  await copyExamples(projectDir);
  clack.log.success('Added examples/getting-started.md');

  // ── Gitignore handling ───────────────────────────────────────────────
  if (hasGitignore(projectDir)) {
    const result = ensureGitignoreEntries(projectDir);
    if (result.action === 'appended') {
      clack.log.success('Updated .gitignore with ChangeDown entries.');
    }
  } else {
    const createIt = await clack.confirm({
      message: 'No .gitignore found. Create one with ChangeDown entries?',
      initialValue: true,
    });
    if (!clack.isCancel(createIt) && createIt) {
      createGitignore(projectDir);
      clack.log.success('Created .gitignore with ChangeDown entries.');
    }
  }

  // ── Settings summary ────────────────────────────────────────────────
  const protocolDesc = protocolMode === 'classic'
    ? 'Classic (old_text/new_text)'
    : 'Compact (at+op)';
  const viewDesc = defaultView === 'review'
    ? 'Review (full markup)'
    : defaultView === 'changes'
      ? 'Changes (clean prose + flags)'
      : 'Settled (final text)';
  const settleDesc = autoSettleApprove && autoSettleReject
    ? 'on approve + reject'
    : autoSettleApprove
      ? 'on approve only'
      : autoSettleReject
        ? 'on reject only'
        : 'disabled';

  clack.log.info([
    'Settings applied:',
    `  Policy: ${policyMode}`,
    `  Protocol: ${protocolDesc}`,
    `  View: ${viewDesc}`,
    `  Auto-settle: ${settleDesc}`,
    `  Author enforcement: ${authorEnforcement as string}`,
    `  Reasoning: ${reasoning as string}`,
  ].join('\n'));

  // ── Adaptive next steps ──────────────────────────────────────────────
  const env = (opts.detectEnvironmentFn ?? detectEnvironment)();

  let nextSteps: string[];
  switch (env.type) {
    case 'vscode':
      nextSteps = [
        '1. Open examples/getting-started.md in your editor',
        '2. Press Alt+Cmd+T (Ctrl+Alt+T) to start tracking changes',
        '3. Accept or reject changes from the review panel',
        ...(env.detectedAgents.length > 0
          ? [`4. In ${env.detectedAgents[0]}: ask "review the changes in getting-started.md"`]
          : ['4. Install an AI agent (Claude Code, Cursor) for agent-assisted reviews']),
      ];
      break;
    case 'terminal-agent':
      nextSteps = [
        `1. In ${env.detectedAgents[0]}: ask "review the changes in examples/getting-started.md"`,
        '2. The agent can propose, accept, and reject changes',
        '3. All changes include author attribution and reasoning',
        '4. Open the file in VS Code / Cursor to see inline decorations',
      ];
      break;
    default:
      // terminal-plain or ci
      nextSteps = [
        '1. Open examples/getting-started.md in VS Code or Cursor',
        '2. Press Alt+Cmd+T (Ctrl+Alt+T) to start tracking changes',
        '3. Install Claude Code or Cursor for agent-assisted reviews',
        '4. Run changedown status to see tracked files',
      ];
      break;
  }

  clack.note(nextSteps.join('\n'), 'Next steps');

  clack.outro('Setup complete!');
}
