import type { ChangeTracksConfig } from '../config/index.js';
import { resolveProtocolMode } from './config.js';

/**
 * Composes a config-driven edit guide for first-contact protocol teaching.
 * Appended to the first read_tracked_file response per session.
 *
 * Each section is conditionally included based on the resolved config.
 * The guide teaches: protocol syntax, identity, annotations, chaining, views.
 */
export function composeGuide(config: ChangeTracksConfig): string {
  const sections: string[] = [];
  const protocolMode = resolveProtocolMode(config.protocol.mode);

  // --- Protocol section (always included) ---
  sections.push(composeProtocolSection(protocolMode, config));

  // --- Author section (always included, content varies) ---
  sections.push(composeAuthorSection(config));

  // --- Annotation section (only if reasoning required for agents) ---
  if (config.reasoning?.propose?.agent === true) {
    sections.push(
      '**Annotations**: Required on every change. Append `{>>reason` to your `op` string, or include reasoning in your propose call.',
    );
  }

  // --- Chaining section (always included) ---
  sections.push(
    '**Chaining edits**: Each `propose_change` response shows your changes applied. ' +
      'The `applied` array includes `preview` (the line with your edit) and coordinates for follow-up edits. ' +
      '`affected_lines` shows neighboring lines with fresh coordinates. No re-read needed between edits. ' +
      'Re-read only after review (accept/reject).',
  );

  // --- Self-revision section (always included) ---
  sections.push(
    '**Revising proposals**: Re-proposing over your own earlier changes auto-supersedes them. ' +
    'No need to reject first. The response includes a `superseded` array with the IDs of replaced changes.',
  );

  // --- View section (always included) ---
  sections.push(composeViewSection(config));

  return `---\n## How to edit this file\n\n${sections.join('\n\n')}\n---`;
}

function composeProtocolSection(
  mode: 'classic' | 'compact',
  config: ChangeTracksConfig,
): string {
  if (mode === 'classic') {
    return (
      '**Editing**: Use `propose_change` with `old_text` (exact text to replace) and `new_text`.\n' +
      'For insertions, use `insert_after` to place new text after an anchor string.\n' +
      'Group related changes: `propose_change(file, changes=[{old_text:..., new_text:...}, ...])`'
    );
  }

  // Compact mode
  const lines = [
    '**Editing**: Use `propose_change` with `at` (LINE:HASH from the margin) and `op`:',
    '  Substitute: `{~~old~>new~~}`  Insert: `{++text++}`  Delete: `{--text--}`',
    '  Highlight: `{==text==}`  Comment: `{>>reason`',
  ];

  if (config.reasoning?.propose?.agent !== true) {
    lines.push('  Annotate: `{~~old~>new~~}{>>reason`  (append {>> to any op)');
  } else {
    lines.push('  Annotate (required): `{~~old~>new~~}{>>reason`  (append {>> to any op)');
  }

  lines.push(
    'Group: `propose_change(file, changes=[{at:"3:a1", op:"{~~old~>new~~}{>>reason"}, ...])`',
    'Include enough context in your `op` to disambiguate repeated text on the same line.',
  );
  lines.push(
    'Range replace: `at:"5:a1-20:b3"` + `op:"{~~~>new content~~}"` replaces the entire range.',
  );
  lines.push(
    'Multi-line ops: use real newlines in your op string — the MCP transport handles encoding.',
  );

  return lines.join('\n');
}

function composeAuthorSection(config: ChangeTracksConfig): string {
  if (config.author.enforcement === 'required') {
    return (
      '**Author**: Required. Pass `author="ai:YOUR-ACTUAL-MODEL"` on every propose/review call.\n' +
      'Do not copy example identities from documentation.'
    );
  }
  return '**Author**: Recommended. Pass `author="ai:YOUR-MODEL"` for clear attribution.';
}

function composeViewSection(config: ChangeTracksConfig): string {
  const defaultView = config.policy.default_view ?? 'review';

  switch (defaultView) {
    case 'review':
      return (
        "**You're seeing**: review view — full deliberation context. CriticMarkup shows proposals " +
        'inline, [ct-N] anchors link to end-of-line metadata.\n' +
        'Other views: `changes` (clean prose + P/A flags), `settled` (accept-all preview).'
      );
    case 'changes':
      return (
        "**You're seeing**: changes view — committed text with P/A flags in the margin. " +
        'Proposals are summarized, not shown inline.\n' +
        'Other views: `review` (full deliberation context), `settled` (accept-all preview).'
      );
    case 'settled':
      return (
        "**You're seeing**: settled view — the document as if all proposals were accepted. " +
        'Proposed deletions are not visible.\n' +
        'Other views: `review` (full deliberation context), `changes` (committed text + P/A flags).'
      );
    default:
      return `**Current view**: ${defaultView}.`;
  }
}
