import type { TrackedChange } from '../state/types';

export interface CanonicalScenario {
  docTitle: string;
  body: { lines: { text: string }[] };
  changes: TrackedChange[];
  narration: Record<string, string>;
}

/**
 * Module-level singleton — built once, shared across all consumers.
 *
 * The source-of-truth for prose lives in
 * src/content/sandbox/canonical-scenario.mdx — writers iterate prose
 * there. This loader mirrors that prose into runtime data so the
 * sandbox state machine can hydrate without parsing MDX at runtime.
 *
 * When prose changes in the MDX file, mirror the change here too.
 * Future improvement: build-time codegen from MDX to TS.
 */
export const CANONICAL_SCENARIO: CanonicalScenario = {
  docTitle: 'Q4 Priorities Memo',
  body: {
    lines: [
      {
        text: 'The quarterly review surfaced three priorities for next year. Of these, the migration to the new platform is the only item with hard external deadlines.',
      },
      {
        text: 'We can defer the brand refresh if we want to without significant downstream impact. The marketing team confirmed this Monday.',
      },
      {
        text: 'For the customer expansion initiative, we will need to allocate two additional engineers to support the integration work. This is the largest resourcing ask in the plan.',
      },
    ],
  },
  changes: [
    {
      id: 'ch1',
      kind: 'ins',
      author: 'ai:claude',
      spanIndex: 0,
      startChar: 81,
      endChar: 81,
      replacement: 'most importantly, ',
      reasoning: 'adds clarity about priority ranking',
      status: 'pending',
    },
    {
      id: 'ch2',
      kind: 'del',
      author: 'ai:claude',
      spanIndex: 1,
      startChar: 32,
      endChar: 46,
      reasoning: 'removes redundancy; commitment is implied',
      status: 'pending',
    },
    {
      id: 'ch3',
      kind: 'sub',
      author: 'ai:claude',
      spanIndex: 2,
      startChar: 36,
      endChar: 92,
      replacement: "we'll allocate two engineers",
      reasoning: 'tightens wordy phrasing',
      status: 'pending',
    },
  ],
  narration: {
    welcome: "Pull up a seat. Here's a memo waiting for a review.",
    claiming: 'Opening your seat…',
    handoff: 'A seat is open for you. Hand the instructions to any AI.',
    'paste-into-ai': 'Paste the instructions into Claude, GPT, or any AI agent.',
    'agent-connected': "ai:claude joined. It's reading your doc.",
    'edits-arriving': 'Three changes have arrived. Hover any one to review.',
    reviewing: "Accept the ones you like. Reject the ones you don't.",
    done: 'Three changes reviewed. Want to try in your real Word?',
  },
};

export async function loadCanonicalScenario(): Promise<CanonicalScenario> {
  return CANONICAL_SCENARIO;
}
