// @fit/config — shared flat ESLint preset (ESLint v9).
//
// Consumed by every workspace via a one-line `eslint.config.mjs`:
//
//   import config from '@fit/config/eslint';
//   export default config;
//
// Type-aware rules (e.g. no-floating-promises) rely on typescript-eslint's
// project service, which auto-discovers each file's nearest tsconfig.json.
// Run eslint from inside the workspace (turbo does this) so the service
// resolves that workspace's tsconfig.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      // Next.js generates this at the app root (gitignored); it carries a
      // triple-slash reference into `.next/` that the TS rules would flag.
      '**/next-env.d.ts',
      '**/.expo/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
    ],
  },

  // Type-checked rules for TypeScript sources.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true },
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Plain JS / config files: no type information available, so disable
  // type-checked rules to avoid "file not found in project" errors.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
    },
  },

  // Disables stylistic rules that would conflict with Prettier. Keep last.
  prettier,
);
