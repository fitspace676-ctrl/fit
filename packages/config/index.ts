// @fit/config — shared build/lint/format presets for the Fit monorepo.
//
// This package ships configuration files consumed by subpath, not runtime
// code. See package.json `exports`:
//
//   @fit/config/tsconfig.base.json   base TypeScript compiler options
//   @fit/config/eslint               shared flat ESLint config (v9)
//   @fit/config/prettier             shared Prettier config
//   @fit/config/tailwind             shared Tailwind theme tokens
//
// Exported here so the package still type-checks as a workspace.
export const CONFIG_PACKAGE = '@fit/config' as const;
