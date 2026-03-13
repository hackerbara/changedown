/**
 * Cucumber-js configuration for ChangeTracks BDD tests.
 *
 * Feature files live in features/ (shared across TS and future Rust runners).
 * Step definitions are TypeScript, loaded via tsx (ESM-compatible TS loader).
 *
 * Run (from packages/tests/):
 *   npx cucumber-js --config features/cucumber.mjs
 *   npx cucumber-js --config features/cucumber.mjs --dry-run
 */
export default {
  paths: ['features/**/*.feature'],
  import: ['features/steps/**/*.ts'],
  // tsx registers as both CJS and ESM loader. Using requireModule + import
  // together is intentional: requireModule loads tsx before ESM resolution,
  // then import resolves .ts step definitions. The Cucumber warning about
  // "use require instead" is a false positive for this setup.
  requireModule: ['tsx'],
  format: ['progress-bar', ['html', 'features/reports/cucumber-report.html']],
  publishQuiet: true,
};
