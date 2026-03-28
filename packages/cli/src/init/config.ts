import * as fs from 'fs';
import * as path from 'path';

export interface ConfigSummary {
  author: string;
  tracking: string;
  policy: string;
  protocol: string;
}

export interface InitConfigOptions {
  author: string;
  trackingInclude?: string[];
  trackingExclude?: string[];
  authorEnforcement?: 'optional' | 'required';
  policyMode?: 'safety-net' | 'strict' | 'permissive';
  policyDefaultView?: 'review' | 'changes' | 'settled';
  protocolMode?: 'classic' | 'compact';
  protocolReasoning?: 'optional' | 'required';
  autoSettleOnApprove?: boolean;
  autoSettleOnReject?: boolean;
}

/**
 * Generate a .changedown/config.toml string from options.
 */
export function generateDefaultConfig(options: InitConfigOptions): string {
  const include = options.trackingInclude ?? ['**/*.md'];
  const exclude = options.trackingExclude ?? ['node_modules/**', 'dist/**', '.git/**'];

  const escapeToml = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  const includeStr = include.map(p => `"${escapeToml(p)}"`).join(', ');
  const excludeStr = exclude.map(p => `"${escapeToml(p)}"`).join(', ');
  const escapedAuthor = escapeToml(options.author);

  const settleApprove = options.autoSettleOnApprove ?? true;
  const settleReject = options.autoSettleOnReject ?? true;
  const policyMode = options.policyMode ?? 'safety-net';
  const defaultView = options.policyDefaultView ?? 'review';
  const protocolMode = options.protocolMode ?? 'classic';
  const reasoning = options.protocolReasoning ?? 'optional';

  return `[tracking]
include = [${includeStr}]
exclude = [${excludeStr}]

[author]
default = "${escapedAuthor}"
enforcement = "${options.authorEnforcement ?? 'optional'}"

[hashline]
enabled = true

[settlement]
auto_on_approve = ${settleApprove}
auto_on_reject = ${settleReject}

[policy]
mode = "${policyMode}"
default_view = "${defaultView}"

[protocol]
mode = "${protocolMode}"
reasoning = "${reasoning}"
`;
}

/**
 * Parse an existing .changedown/config.toml and return a human-readable summary.
 * Returns null if the config file does not exist.
 */
export function parseConfigSummary(projectDir: string): ConfigSummary | null {
  const configPath = path.join(projectDir, '.changedown', 'config.toml');
  if (!fs.existsSync(configPath)) return null;

  const content = fs.readFileSync(configPath, 'utf8');

  // Simple TOML value extraction (avoids adding a parser dep to the CLI)
  const extract = (key: string): string => {
    const match = content.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`));
    return match?.[1] ?? '';
  };

  const extractArray = (key: string): string => {
    const match = content.match(new RegExp(`${key}\\s*=\\s*\\[([^\\]]*)\\]`));
    return match?.[1]?.replace(/"/g, '').trim() ?? '';
  };

  return {
    author: extract('default') || 'unknown',
    tracking: extractArray('include') || '**/*.md',
    policy: extract('mode') || 'safety-net', // first match is [policy] mode
    protocol: (() => {
      const protoSection = content.indexOf('[protocol]');
      if (protoSection === -1) return 'classic';
      const afterProto = content.slice(protoSection);
      const match = afterProto.match(/mode\s*=\s*"([^"]*)"/);
      return match?.[1] ?? 'classic';
    })(),
  };
}
