export { resolveIdentity } from './identity.js';
export { generateDefaultConfig, parseConfigSummary, type InitConfigOptions, type ConfigSummary } from './config.js';
export { detectAgents, configureAgents, type AgentStatus } from './agents.js';
export { copyExamples, type CopyExamplesOptions } from './examples.js';
export { ensureGitignoreEntries, createGitignore, hasGitignore, type GitignoreResult } from './gitignore.js';
export { detectEnvironment, type EnvironmentInfo, type EnvironmentType, type DetectEnvironmentOptions } from './environment.js';
export { runInit, type ClackAdapter, type RunInitOptions } from './runner.js';
