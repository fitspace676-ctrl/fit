// Repo-root ESLint config. ESLint resolves config from the working directory,
// so this governs files linted from the root (e.g. lint-staged in the
// pre-commit hook). Per-workspace `eslint.config.mjs` files re-export the same
// shared preset for `turbo run lint`.
import config from '@fit/config/eslint';

export default config;
