/**
 * Cucumber-js configuration for DOCX import/export BDD tests.
 *
 * Loads only world.ts + docx.steps.ts to avoid pulling in unrelated
 * step files that depend on packages not built in the docx worktree.
 *
 * Run (from packages/tests/):
 *   npx cucumber-js --config features/cucumber-docx.mjs
 *   npx cucumber-js --config features/cucumber-docx.mjs --tags '@docx and @fast'
 */
export default {
  paths: ['features/docx-import-export.feature', 'features/docx/*.feature'],
  import: ['features/steps/docx-world.ts', 'features/steps/docx.steps.ts'],
  requireModule: ['tsx'],
  format: ['progress-bar', ['html', 'features/reports/cucumber-docx-report.html']],
  publishQuiet: true,
};
