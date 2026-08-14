// @fit/astryx-theme — Fit's Astryx themes.
//
// Two brands live here, each compiled to its own scoped stylesheet:
//
//   `fit`       Aurora-glass · electric indigo · Manrope/Archivo   → admin console
//   `formacore` Lime Block   · charcoal + one lime · Noto Georgian → member portal
//
// Import the theme object for the `<Theme theme={…}>` provider, and the matching
// compiled token CSS from the `./theme.css` / `./formacore.css` exports (built by
// `pnpm --filter @fit/astryx-theme theme:build`, i.e. `astryx theme build`).
// Astryx scopes each build to `[data-astryx-theme="<name>"]`, so an app opting
// into one is unaffected by changes to the other.

export { fitTheme, default } from './src/fitTheme';
export { formacoreTheme } from './src/formacoreTheme';
