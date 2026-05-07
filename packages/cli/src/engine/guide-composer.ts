import type { ChangeDownConfig } from '../config/index.js';

function resolveProtocolMode(mode: 'classic' | 'compact'): 'classic' | 'compact' {
  return mode === 'compact' ? 'compact' : 'classic';
}

/**
 * Composes a config-driven edit guide for first-contact protocol teaching.
 * Appended to the first read_tracked_file response per session.
 *
 * Each section is conditionally included based on the resolved config.
 * The guide teaches: protocol syntax, identity, annotations, chaining, views.
 */
export interface ComposeGuideOptions {
  targetKind?: 'file' | 'word';
}

export function composeGuide(config: ChangeDownConfig, options: ComposeGuideOptions = {}): string {
  const sections: string[] = [];
  const protocolMode = resolveProtocolMode(config.protocol.mode);

  // --- Protocol section (always included) ---
  sections.push(composeProtocolSection(protocolMode, config));

  if (options.targetKind === 'word') sections.push(composeWordSessionSection(protocolMode));

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
  config: ChangeDownConfig,
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


function composeWordSessionSection(mode: 'classic' | 'compact'): string {
  const preferred = mode === 'compact'
    ? 'Preferred for word://: compact+hashline with `at: "LINE:HASH"` and `op`.'
    : 'Preferred for word:// in this mode: classic `old_text` and `new_text`.';
  return (
    `**Word sessions**: ${preferred} ` +
    'Word sessions also accept the other public ChangeDown proposal family when arguments are unambiguous: classic `old_text`/`new_text` and compact+hashline `LINE:HASH`. ' +
    'Use exactly one proposal per call for `word://`; split multi-change edits into separate calls. ' +
    'Do not pass public `oldL2` or `newL2`.'
  );
}

function composeAuthorSection(config: ChangeDownConfig): string {
  if (config.author.enforcement === 'required') {
    return (
      '**Author**: Required. Pass `author="ai:YOUR-ACTUAL-MODEL"` on every propose/review call.\n' +
      'Do not copy example identities from documentation.'
    );
  }
  return '**Author**: Recommended. Pass `author="ai:YOUR-MODEL"` for clear attribution.';
}

function composeViewSection(config: ChangeDownConfig): string {
  const defaultView = config.policy.default_view ?? 'working';

  switch (defaultView) {
    case 'working':
      return (
        "**You're seeing**: working view — full deliberation context. CriticMarkup shows proposals " +
        'inline, [cn-N] anchors link to end-of-line metadata.\n' +
        'Other views: `simple` (clean prose + P/A flags), `decided` (decided-changes-only preview).'
      );
    case 'simple':
      return (
        "**You're seeing**: simple view — current projection text with P/A flags in the margin. " +
        'Proposals are summarized, not shown inline.\n' +
        'Other views: `working` (full deliberation context), `decided` (decided-changes-only preview).'
      );
    case 'decided':
      return (
        "**You're seeing**: decided view — the document with only decided changes applied. " +
        'Proposed deletions are not visible.\n' +
        'Other views: `working` (full deliberation context), `simple` (current text + P/A flags).'
      );
    default:
      return `**Current view**: ${defaultView}.`;
  }
}
