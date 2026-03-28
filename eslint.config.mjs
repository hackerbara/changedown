import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/dist-esm/**',
      '**/out/**',
      '**/node_modules/**',
      '**/*.d.ts',
      'docs/**',
      'website/**',
      'viewer/**',
      'features/**',
      'scripts/**',
      'packages/benchmarks/**',
      'packages/cursor-preview/**',
      'packages/neovim-plugin/**',
      'packages/changedown-sublime/**',
      'packages/config-types/**',
      'packages/tests/**',
    ],
  },

  // Base config for all in-scope TypeScript files
  {
    files: ['packages/core/src/**/*.ts', 'packages/lsp-server/src/**/*.ts', 'packages/vscode-extension/src/**/*.ts', 'packages/cli/src/**/*.ts', 'packages/docx/src/**/*.ts', 'packages/opencode-plugin/src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname, // Requires Node >= 20.11. Fallback: dirname(fileURLToPath(import.meta.url))
      },
    },
    plugins: {
      'import-x': importX,
    },
    rules: {
      // --- Type safety ---
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',

      // --- Explicit contracts (exported functions only) ---
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowDirectConstAssertionInArrowFunctions: true,
        allowConciseArrowFunctionExpressionsStartingWithVoid: true,
      }],
      '@typescript-eslint/explicit-module-boundary-types': 'warn',

      // --- Grep-ability ---
      'import-x/no-default-export': 'warn',

      // --- Import hygiene ---
      'import-x/order': ['warn', {
        'groups': ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
      }],

      // --- Complexity limits ---
      'max-lines': ['warn', { max: 700, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', 20],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],

      // --- Code quality ---
      'eqeqeq': 'warn',
      'curly': 'warn',
      'no-throw-literal': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // --- Relax rules from recommendedTypeChecked that are too noisy ---
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // recommendedTypeChecked sets these to 'error'; downgrade to warn
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      'prefer-const': 'warn',
    },
  },

  // Override: allow default exports in config files
  {
    files: ['**/*.config.*', '**/vite.config.*', '**/vitest.config.*'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // Browser Web Worker entry point — excluded from tsconfig.json (uses tsconfig.browser.json)
  {
    ignores: ['packages/lsp-server/src/browser-server.ts'],
  },
);
