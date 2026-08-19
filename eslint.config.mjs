// Repo-root ESLint config. ESLint resolves config from the working directory,
// so this governs files linted from the root (e.g. lint-staged in the
// pre-commit hook). Per-workspace `eslint.config.mjs` files re-export the same
// shared preset for `turbo run lint`.
import config from '@fit/config/eslint';

export default [
  ...config,
  {
    // The design workstation's artboards are reference material, not app source.
    // They belong to no tsconfig project, so the type-checked rules cannot parse
    // them at all — and there is nothing in a mock screen for a linter to
    // protect. Ignored here rather than in the shared preset because only the
    // root config (lint-staged in the pre-commit hook) ever reaches this path.
    ignores: ['forma-core-app/**'],
  },
];
