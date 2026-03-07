import path from "node:path";

export type SurfaceId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type TaskId =
  | "task1" | "task1_outcome"
  | "task2" | "task3" | "task4"
  | "task5" | "task5_outcome" | "task5_v2" | "task5_mixed"
  | "task6" | "task7" | "task8" | "task9" | "task10"
  | "task6_patch";

// Legacy compat — old runner used WorkflowId
export type WorkflowId = "A" | "B" | "C" | "D";

export interface TaskConfig {
  fixtureDir: string;
  description: string;
  surfaceA?: string; // undefined = skip this surface for this task
  surfaceB: string;
  surfaceC: string;
  surfaceD?: string; // sc CLI via Bash — undefined = skip
  surfaceE?: string; // committed view — undefined = skip
  surfaceF?: string; // V1-Classic protocol — undefined = skip
  surfaceG?: string; // V1-Compact protocol — undefined = skip
  surfaceH?: string; // V1 experimental patch-wrapper surface — undefined = skip
}

export interface BenchmarkPrompts {
  tasks: Record<TaskId, TaskConfig>;
  constraint: string;
}

// Legacy compat
export interface PromptsConfig {
  taskDescription: string;
  workflowA: string;
  workflowB: string;
  workflowC: string;
  workflowD: string;
}

/**
 * Build the full task prompt for a surface by combining task description,
 * surface instruction, and global constraint.
 * Returns null if this surface is not applicable for this task (e.g., A on task4).
 */
export function getTaskPromptForSurface(
  task: TaskConfig,
  surface: SurfaceId,
  constraint: string
): string | null {
  const key = `surface${surface}` as keyof TaskConfig;
  const surfaceInstruction = task[key] as string | undefined;
  if (!surfaceInstruction) return null;

  let fullPrompt = `${task.description}\n\n${surfaceInstruction}\n\n${constraint}`;

  // For Surface D (CLI-only), inject the sc CLI path at the beginning
  if (surface === "D") {
    const cliPath = path.join(process.cwd(), "changetracks-plugin", "mcp-server", "dist", "cli.js");
    const cliInstructions = `You have access to the \`sc\` CLI for ChangeTracks operations.
Run: node ${cliPath} <command> [args]

Available commands:
  read <file>      Read file with hashline coordinates (LINE:HASH|content)
  propose <file>   Propose a single tracked change
  batch <file>     Propose multiple changes atomically in one call
  review <file>    Accept, reject, or request changes
  respond <file>   Add a response to a discussion thread
  list <path>      List open threads (file or directory)

Run with --help on any command for usage details.

`;
    fullPrompt = cliInstructions + fullPrompt;
  }

  return fullPrompt;
}

// Legacy compat — keep old function for existing code
const WORKFLOW_KEYS: Record<WorkflowId, keyof PromptsConfig> = {
  A: "workflowA",
  B: "workflowB",
  C: "workflowC",
  D: "workflowD",
};

export function getTaskPromptForWorkflow(
  workflow: WorkflowId,
  baseTaskDescription: string,
  prompts: PromptsConfig
): string {
  const instruction = prompts[WORKFLOW_KEYS[workflow]];
  return `${baseTaskDescription}\n\nWorkflow: ${instruction}`;
}
