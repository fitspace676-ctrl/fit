// @fit/config — shared Prettier preset.
//
// Prettier resolves config by walking up from each file, so the repo-root
// `prettier.config.mjs` re-exports this and governs every workspace. A new
// app inherits formatting automatically — no per-app config required.

/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};
