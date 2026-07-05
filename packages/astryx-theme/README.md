# @fit/astryx-theme

Fit's custom [Astryx](https://astryx.atmeta.com) theme — the formacore
"Aurora-glass" brand mapped onto Astryx's theme-token contract, so the member
portal (`@fit/web`) and admin console (`@fit/admin`) render Astryx components in
**our** colors and type rather than Astryx's neutral default.

## What it provides

- `@fit/astryx-theme` — the source theme (`fitTheme`, from `defineTheme`).
- `@fit/astryx-theme/built` — the compiled theme object passed to `<Theme>`.
- `@fit/astryx-theme/theme.css` — the compiled token CSS, imported in each app's
  `globals.css` after `@astryxdesign/core`'s `reset.css` + `astryx.css`.

The theme `extends` `@astryxdesign/theme-neutral` for its accessibility-tuned
token spine, then overrides only the brand slots: electric-indigo accent
(`#6257E3`), status green/amber/red, info blue, the Manrope/Archivo/JetBrains
type families, and the field/btn/card/pill radii. See `src/fitTheme.ts`.

## Regenerating the compiled theme

The `dist/` output is **committed** (see `.gitignore`). It's produced by the
Astryx CLI, which requires **Node ≥ 22.13** — a version CI and the deploy
pipelines don't run — so we ship the built files instead of building them in the
pipeline. `@astryxdesign/core` itself has no such Node floor, so the apps build
and run on Node 20 as before.

After editing `src/fitTheme.ts`, regenerate and commit `dist/`:

```bash
pnpm --filter @fit/astryx-theme theme:build
```

(Requires Node ≥ 22.13; use e.g. `nvm use 22` first.)
