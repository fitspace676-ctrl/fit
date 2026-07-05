# StyleX build integration (Next.js 15, apps/web + apps/admin)

App-authored StyleX (`stylex.create()` + the Astryx `xstyle` prop) is compiled by
the **NAPI-RS SWC StyleX compiler**, wired through
[`@stylexswc/nextjs-plugin`](https://www.npmjs.com/package/@stylexswc/nextjs-plugin)
in each app's `next.config.mjs`. We deliberately **allow** app-authored StyleX
(rather than forbidding it and constraining layout to Astryx primitives) so page
grids, layout wrappers, and one-off overrides on Astryx components can be authored
the same way Astryx authors its own styles — but the compiler is mandatory: the
`@stylexjs/stylex` runtime **throws** on any `stylex.create` it reaches
un-compiled, so precompiled Astryx CSS alone is not enough once we write our own
styles.

| Decision                 | Choice                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App-authored StyleX      | **Allowed** — `stylex.create` + `xstyle`, compiled at build time                                                                                                                        |
| Compiler                 | `@stylexswc/nextjs-plugin@0.15.5` (NAPI-RS SWC compiler, StyleX 0.18-compatible)                                                                                                        |
| Why not the Babel plugin | `@stylexjs/babel-plugin` forces Next off SWC, and `next/font/google` refuses to run under a custom Babel config — the apps depend on `next/font` (Manrope / Archivo / JetBrains Mono)   |
| CSS extraction           | The plugin's webpack pass emits `_stylex-webpack-generated.css`, injected via Next's `mini-css-extract` — **separate** from the Tailwind PostCSS pipeline that still owns `globals.css` |
| Bundler                  | Webpack (`next dev` / `next build`) — the mode both apps run today                                                                                                                      |

## Why this compiler

StyleX must transform `stylex.create`/`stylex.props` at build time. There are two
transform families: **Babel** (`@stylexjs/babel-plugin`) and **SWC**
(`@stylexswc/*`). Babel is a non-starter here — enabling a custom Babel config
disables Next's SWC transform, and `next/font/google` (which every root layout
uses to load Manrope, Archivo, and JetBrains Mono) hard-errors under Babel. The
SWC compiler runs as a webpack loader/plugin **alongside** Next's own SWC, so
`next/font`, `optimizePackageImports`, and Sentry's `withSentryConfig` all keep
working. We pin `@stylexswc/nextjs-plugin@0.15.5`, whose `rs-compiler` targets
StyleX `^0.18.2` — matching the `@stylexjs/stylex@0.18.3` runtime the Astryx
foundation (T11.1) installed, so compiled output and runtime `props` merging stay
in lockstep.

The plugin is composed innermost in the config chain:
`withSentryConfig(withNextIntl(withStylex(nextConfig)))`. `rsOptions` sets
`unstable_moduleResolution: { type: 'commonJS', rootDir }` so typed token imports
(`@astryxdesign/core/theme/tokens.stylex`) resolve across packages, and mirrors the
tsconfig `@/*` alias.

## Tailwind coexistence (T11.6)

StyleX and Tailwind run in **separate** pipelines that do not clash: Tailwind is a
PostCSS plugin over `globals.css`; StyleX atoms are extracted by the webpack plugin
into their own stylesheet and injected by Next. Both are unlayered single-class
atoms, so within a single element the last-declared rule wins — the guardrail
during migration is therefore **one styling system per element**: use `xstyle` for
Astryx-component overrides and new layout, keep Tailwind utilities on the legacy
formacore screens, and don't style the same node with both. This lets the two
systems coexist until the Tailwind decommission (T11.6) removes the legacy path.

## Turbopack

Both apps run **webpack** for dev and prod (`next dev` / `next build`, no
`--turbopack`), so the webpack integration above is authoritative and emits StyleX
atoms in both. Turbopack does not support webpack plugins; if an app later opts
into `--turbopack`, switch its config to the plugin's `/turbopack` export and add
`@stylexswc/postcss-plugin` for CSS extraction (the loader compiles the JS but does
not extract CSS under Turbopack). No app takes that path today.

## Verification

- `next build` for **@fit/web** and **@fit/admin** — both green; the extracted CSS
  contains the app atoms (`.x1rapzsl{place-items:start}`,
  `.xhlvvcx{padding:3rem}`, `.x1hviunn{border-radius:var(--radius-container)}`).
- `next dev` — the `/astryx-smoke` route renders with
  `<main class="xhlvvcx … x1rapzsl">` and serves
  `/_next/static/css/_stylex-webpack-generated.css` carrying those atoms.
- `type-check`, `lint`, and `prettier --check` clean on both apps.
