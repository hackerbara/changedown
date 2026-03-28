import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ConfigResolver } from '@changedown/mcp/internals';
import { type ChangeDownConfig } from '@changedown/mcp/internals';

/**
 * Creates a ConfigResolver for tests by writing a temporary config.toml
 * from the given ChangeDownConfig object. The config is written to
 * `tmpDir/.changedown/config.toml` so the resolver discovers it when
 * given file paths under tmpDir.
 */
export async function createTestResolver(
  tmpDir: string,
  config: ChangeDownConfig,
): Promise<ConfigResolver> {
  const configDir = path.join(tmpDir, '.changedown');
  await fs.mkdir(configDir, { recursive: true });

  // Build TOML from config
  const toml = configToToml(config);
  await fs.writeFile(path.join(configDir, 'config.toml'), toml, 'utf-8');

  return new ConfigResolver(tmpDir);
}

function configToToml(config: ChangeDownConfig): string {
  const lines: string[] = [];

  lines.push('[tracking]');
  lines.push(`include = ${JSON.stringify(config.tracking.include)}`);
  lines.push(`exclude = ${JSON.stringify(config.tracking.exclude)}`);
  lines.push(`default = "${config.tracking.default}"`);
  lines.push(`auto_header = ${config.tracking.auto_header}`);
  lines.push('');

  lines.push('[author]');
  lines.push(`default = "${config.author.default}"`);
  lines.push(`enforcement = "${config.author.enforcement}"`);
  lines.push('');

  lines.push('[hooks]');
  lines.push(`enforcement = "${config.hooks.enforcement}"`);
  lines.push(`exclude = ${JSON.stringify(config.hooks.exclude)}`);
  lines.push('');

  lines.push('[matching]');
  lines.push(`mode = "${config.matching.mode}"`);
  lines.push('');

  lines.push('[hashline]');
  lines.push(`enabled = ${config.hashline.enabled}`);
  if (config.hashline.auto_remap !== undefined) {
    lines.push(`auto_remap = ${config.hashline.auto_remap}`);
  }
  lines.push('');

  if (config.settlement) {
    lines.push('[settlement]');
    lines.push(`auto_on_approve = ${config.settlement.auto_on_approve}`);
    lines.push(`auto_on_reject = ${config.settlement.auto_on_reject}`);
    lines.push('');
  }

  if (config.policy) {
    lines.push('[policy]');
    lines.push(`mode = "${config.policy.mode}"`);
    lines.push(`creation_tracking = "${config.policy.creation_tracking}"`);
    lines.push(`default_view = "${config.policy.default_view}"`);
    lines.push(`view_policy = "${config.policy.view_policy}"`);
    lines.push('');
  }

  if (config.protocol) {
    lines.push('[protocol]');
    lines.push(`mode = "${config.protocol.mode}"`);
    lines.push(`level = ${config.protocol.level}`);
    lines.push(`reasoning = "${config.protocol.reasoning}"`);
    lines.push(`batch_reasoning = "${config.protocol.batch_reasoning}"`);
    lines.push('');
  }

  if (config.reasoning) {
    lines.push('[reasoning.propose]');
    lines.push(`human = ${config.reasoning.propose.human}`);
    lines.push(`agent = ${config.reasoning.propose.agent}`);
    lines.push('');
    lines.push('[reasoning.review]');
    lines.push(`human = ${config.reasoning.review.human}`);
    lines.push(`agent = ${config.reasoning.review.agent}`);
    lines.push('');
  }

  if (config.response) {
    lines.push('[response]');
    if (config.response.affected_lines !== undefined) {
      lines.push(`affected_lines = ${config.response.affected_lines}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
