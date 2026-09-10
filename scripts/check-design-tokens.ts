#!/usr/bin/env tsx
/**
 * CI guard: the mobile design tokens have not drifted from the design source
 * (WP-2).
 *
 * THE DEFECT THIS EXISTS FOR. The design was repainted to "Lime Block" on
 * 2026-08-18 (`bea6e41`). `packages/ui-mobile` carried the July indigo palette
 * for six weeks afterwards — four of its nine ramps were a different colour
 * system, and the four that matched byte-for-byte were the four the design had
 * RETIRED. `packages/config/tailwind.config.base.mjs` was still indigo too, for
 * the second time (the pre-formacore blue was the first), even though
 * `docs/design-parity-audit.md` claimed T10.6 had closed it. Every one of those
 * was governed by a prose instruction telling a human to keep two files in
 * sync. Prose does not fail a build.
 *
 * Five assertions, modelled on `scripts/check-tailwind-guardrail.ts` — same
 * shape, same CI wiring. Any one of them would have caught the July→August
 * drift in one line.
 *
 *   1. The shipped brand/ink/danger stops equal `_design/tokens.json`.
 *   2. No retired ramp is present in the shipped palette or the preset.
 *   3. `packages/config/tailwind.config.base.mjs` brand equals the design brand.
 *   4. Every semantic colour is a palette member, white, transparent, or an
 *      explicitly allowlisted rgba().
 *   5. The mobile icon dictionary and `ui-web`'s agree on what each shared
 *      name MEANS — every deliberate divergence is on a ledger with a reason.
 *
 * ---------------------------------------------------------------------------
 * A NOTE ON `_design/tokens.json`, BEFORE YOU "FIX" THE ASYMMETRY BELOW.
 *
 * That file is authoritative for the RAW RAMPS and for nothing else. It is
 * STALE in two specific ways, both known and both deliberate to work around:
 *
 *   - It has NO LIGHT MODE. It is a single set of dark-mode ramps. The semantic
 *     light+dark layer lives in `packages/astryx-theme/src/formacoreTheme.ts`,
 *     which is decision D1's source of truth and what `semantic.ts` transcribes.
 *     Assertion 4 therefore checks the semantic map against the PALETTE, not
 *     against tokens.json.
 *   - It STILL SHIPS SIX RETIRED RAMPS — `accent`, `iris`, `success`,
 *     `warning`, `info`, `flame`. It was never pruned after the repaint, and
 *     `accent`/`iris` in it are byte-identical copies of the ink ramp.
 *     `_design/MEMORY.md` records the retirement in prose.
 *
 * So: assertion 1 reads exactly three keys out of that file, and assertion 2
 * asserts the other six are ABSENT from what we ship. If you find yourself
 * about to add `success` to the mobile palette "because tokens.json has it" —
 * that is the trap this paragraph exists to stop. The replacement mapping is
 * success→brand (lime), warning→ink, accent/iris/info/flame→ink.
 * ---------------------------------------------------------------------------
 *
 * Exit 1 (listing every failure, not just the first) when anything drifts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { palette, RETIRED_RAMPS } from '../packages/ui-mobile/src/palette.mjs';
import {
  ICON_MOBILE_ONLY,
  ICON_PATHS,
  ICON_WEB_DIVERGENCE,
} from '../packages/ui-mobile/src/primitives/icon/paths';
import { colorTuples, RGBA_ALLOWLIST } from '../packages/ui-mobile/src/tokens/semantic';

const ROOT = process.cwd();

/** The design source. Tracked in git, so a missing file is a real failure. */
const DESIGN_TOKENS = resolve(ROOT, 'forma-core-app/.workstation/design/_design/tokens.json');

/** The shared Tailwind theme every non-formacore surface inherits its brand from. */
const BASE_CONFIG = resolve(ROOT, 'packages/config/tailwind.config.base.mjs');

/** The mobile NativeWind preset. */
const MOBILE_PRESET = resolve(ROOT, 'packages/ui-mobile/tailwind.preset.mjs');

/** The web icon dictionary, for assertion 5. */
const WEB_ICONS = resolve(ROOT, 'packages/ui-web/src/icon.tsx');

/** The three ramps mobile ships, and the only three assertion 1 reads. */
const SHIPPED_RAMPS = ['ink', 'brand', 'danger'] as const;

/**
 * Read a `const <name> = { key: 'value', … }` dictionary out of a source file,
 * without importing it.
 *
 * Assertion 5 needs `I` out of `packages/ui-web/src/icon.tsx`, and that file is
 * a DOM component: importing it would pull a web renderer into a Node script,
 * and `scripts/tsconfig.json` has no `jsx` setting, so the import would be
 * error-typed and the type-aware lint rules would (correctly) refuse it.
 * Parsing is also what the original WP-2 TODO asked for — with the caveat that
 * a REGEX over path data will bite you on multi-line `d` attributes, which is
 * why this walks the AST instead. Same approach as
 * `scripts/check-controller-guards.ts` and `check-tailwind-guardrail.ts`.
 *
 * Returns `null` when the file or the declaration is missing, so the caller can
 * report that as a real failure rather than as an empty dictionary that
 * silently passes every comparison.
 */
function readStringDictionary(file: string, name: string): Record<string, string> | null {
  if (!existsSync(file)) return null;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let literal: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (literal) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      // Unwrap `as const` / `satisfies` before looking for the object.
      let init = node.initializer;
      while (init && (ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) {
        init = init.expression;
      }
      if (init && ts.isObjectLiteralExpression(init)) literal = init;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!literal) return null;

  const out: Record<string, string> = {};
  for (const prop of literal.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : undefined;
    if (key === undefined) continue;
    const value = prop.initializer;
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
      out[key] = value.text;
    }
  }
  return out;
}

const failures: string[] = [];

function fail(check: string, detail: string): void {
  failures.push(`[${check}] ${detail}`);
}

/** Hexes are compared case-insensitively — `#e4f26a` is not a drift. */
function sameHex(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

type Ramp = Record<string, string>;

/** Diff two ramps stop-for-stop, reporting every difference. */
function diffRamp(check: string, label: string, actual: Ramp, expected: Ramp): void {
  const actualStops = Object.keys(actual).sort();
  const expectedStops = Object.keys(expected).sort();

  const missing = expectedStops.filter((s) => !actualStops.includes(s));
  const extra = actualStops.filter((s) => !expectedStops.includes(s));

  if (missing.length > 0) fail(check, `${label}: missing stop(s) ${missing.join(', ')}`);
  if (extra.length > 0) fail(check, `${label}: unexpected stop(s) ${extra.join(', ')}`);

  for (const stop of expectedStops) {
    const a = actual[stop];
    const e = expected[stop];
    if (a === undefined || e === undefined) continue;
    if (!sameHex(a, e)) fail(check, `${label}-${stop}: ships ${a}, design says ${e}`);
  }
}

async function main(): Promise<void> {
  // =========================================================================
  // Load the design source.
  // =========================================================================
  if (!existsSync(DESIGN_TOKENS)) {
    console.error(`Design tokens guard: cannot read the design source.\n\n  ${DESIGN_TOKENS}\n`);
    console.error(
      'That file is tracked in git. If it moved, update DESIGN_TOKENS in\n' +
        'scripts/check-design-tokens.ts — do not delete the check.',
    );
    process.exit(1);
  }

  const design = JSON.parse(readFileSync(DESIGN_TOKENS, 'utf8')) as {
    colors?: Record<string, Ramp>;
  };
  const designColors = design.colors ?? {};

  // =========================================================================
  // 1. The shipped ramps equal the design's.
  //
  // Note this reads brand/ink/danger and NOTHING else out of tokens.json — see
  // the header. All three are 11 stops; `formacoreTheme.ts` quotes only the
  // eight brand stops it happens to use, which is why the design file rather
  // than the theme is the authority for the raw ramp.
  // =========================================================================
  for (const name of SHIPPED_RAMPS) {
    const expected = designColors[name];
    if (!expected) {
      fail('1 palette', `_design/tokens.json has no "${name}" ramp — the design source changed.`);
      continue;
    }
    diffRamp('1 palette', name, palette[name] as unknown as Ramp, expected);
  }

  // =========================================================================
  // 2. No retired ramp is shipped.
  //
  // Checked against BOTH the runtime palette and the Tailwind preset's colour
  // object, because they are two different ways for a ramp to come back: an
  // export nobody uses, and a utility class that silently paints a neutral.
  // Mobile wants `bg-iris-500` to be a build error, which requires the key to
  // be absent from `theme.colors` — see the preset's header for why web
  // deliberately does the opposite.
  // =========================================================================
  const preset = (await import(pathToFileURL(MOBILE_PRESET).href)) as {
    default?: { theme?: { colors?: Record<string, unknown> } };
  };
  const presetColors = preset.default?.theme?.colors ?? {};

  for (const retired of Object.keys(RETIRED_RAMPS)) {
    if (retired in palette) {
      fail(
        '2 retired',
        `"${retired}" is back in the shipped palette. The direction retired it; ` +
          `use ${RETIRED_RAMPS[retired]} instead.`,
      );
    }
    if (retired in presetColors) {
      fail(
        '2 retired',
        `"${retired}" is back in tailwind.preset.mjs theme.colors. ` +
          `\`bg-${retired}-500\` must be a build error on mobile; use ${RETIRED_RAMPS[retired]}.`,
      );
    }
  }

  // Belt and braces: the preset must ship exactly the shipped palette's keys.
  const expectedPresetKeys = ['transparent', 'white', ...SHIPPED_RAMPS].sort();
  const actualPresetKeys = Object.keys(presetColors).sort();
  if (actualPresetKeys.join(',') !== expectedPresetKeys.join(',')) {
    fail(
      '2 retired',
      `tailwind.preset.mjs theme.colors is [${actualPresetKeys.join(', ')}], ` +
        `expected [${expectedPresetKeys.join(', ')}].`,
    );
  }

  // =========================================================================
  // 3. The shared base config's brand is the design's brand.
  //
  // This one has failed twice in this repo's history — first to a pre-formacore
  // blue, then to the electric indigo it held until the August repaint was
  // never propagated. It affects `@fit/superadmin` today, which inherits its
  // brand straight from here with no formacore config of its own.
  //
  // Dynamically imported so this script does not need a `.d.mts` for a config
  // file that has no types.
  // =========================================================================
  if (!existsSync(BASE_CONFIG)) {
    fail('3 base config', `${BASE_CONFIG} does not exist.`);
  } else {
    const base = (await import(pathToFileURL(BASE_CONFIG).href)) as {
      fitTheme?: { colors?: Record<string, Ramp> };
    };
    const baseBrand = base.fitTheme?.colors?.brand;
    const designBrand = designColors['brand'];
    if (!baseBrand) {
      fail('3 base config', 'tailwind.config.base.mjs exports no fitTheme.colors.brand.');
    } else if (designBrand) {
      diffRamp('3 base config', 'fitTheme.colors.brand', baseBrand, designBrand);
    }
  }

  // =========================================================================
  // 4. Every semantic value is accounted for.
  //
  // The semantic map is a hand transcription of `formacoreTheme.ts` (D1: that
  // module is web-only — it compiles to CSS custom properties and imports
  // `@astryxdesign/*`, so it cannot be imported from React Native). A hand
  // transcription is exactly where a stray hex gets typed, so every value has
  // to resolve to something nameable: a stop on a shipped ramp, white,
  // transparent, or one of the twelve rgba() overlays RN has no other way to
  // express (scrim, glass, header, focus ring, shadow).
  //
  // This is the assertion that catches "I just needed a slightly darker grey".
  // =========================================================================
  const paletteValues = new Set<string>();
  for (const name of SHIPPED_RAMPS) {
    for (const value of Object.values(palette[name] as unknown as Ramp)) {
      paletteValues.add(value.toUpperCase());
    }
  }
  paletteValues.add(palette.white.toUpperCase());
  paletteValues.add(palette.transparent.toUpperCase());

  for (const [role, tuple] of Object.entries(colorTuples)) {
    const [light, dark] = tuple;
    for (const [mode, value] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      if (paletteValues.has(value.toUpperCase())) continue;
      if (RGBA_ALLOWLIST.has(value)) continue;
      fail(
        '4 semantic',
        `${role} (${mode}) is "${value}" — not a palette stop, not white/transparent, ` +
          'and not in RGBA_ALLOWLIST. Use a ramp stop, or add it to the allowlist ' +
          'with a reason on the line next to it.',
      );
    }
  }

  // =========================================================================
  // 5. The icon dictionary diff.
  //
  // THE DEFECT THIS CATCHES: one NAME coming to mean two different glyphs.
  // Decision D6 is "one icon vocabulary across web and mobile" — web dictionary
  // NAMES, artboard PATH DATA, stroke 1.9 — and the worked example is `arrow`.
  // `@fit/ui-web` draws a right-pointing arrow under that name; the artboards
  // draw a diagonal-out one. Ship the artboard drawing under the web name and
  // a screen written against the shared vocabulary silently renders the wrong
  // glyph, forever, because both of them are arrows and nobody looks twice.
  //
  // WHY THIS IS NOT A STRICT `d` EQUALITY CHECK, WHICH IS WHAT THE ORIGINAL
  // TODO ASKED FOR. It cannot be. D6 puts ARTBOARD path data under WEB names,
  // and the artboards redrew most of the set for the August "Lime Block"
  // repaint (re-cut on the 24 grid for a 1.9 stroke, against web's 2.1). A
  // strict check would have failed on 26 of 53 shared names the day it was
  // written, and a check that is red on arrival gets deleted, not fixed.
  //
  // So the assertion is on the SET of divergences rather than on their
  // absence: `ICON_WEB_DIVERGENCE` in `paths.ts` is a ledger of every shared
  // name whose `d` deliberately differs, each with a reason, and this check
  // fails when reality and the ledger disagree in EITHER direction —
  //
  //   · a shared name diverges and is not in the ledger  → someone changed a
  //     glyph on one platform only, or gave a web name a new meaning;
  //   · a ledger entry no longer diverges, or names a glyph web no longer has
  //     → the ledger is stale and is now documenting nothing.
  //
  // Both force a human to write (or delete) a line, which is where you notice
  // you are about to ship two different arrows. Mobile-only names get the same
  // treatment through `ICON_MOBILE_ONLY`, so the two vocabularies cannot fork
  // by accretion. Web-only names are INFORMATION, not a failure: mobile ships
  // a subset on purpose.
  //
  // Both dictionaries are imported rather than AST-parsed. The original TODO
  // suggested an AST walk to avoid regexing multi-line `d` attributes — but
  // both files export a plain object literal of string constants, so `tsx`
  // simply loads them and the whole hazard evaporates. (`ui-web/src/icon.tsx`
  // is a DOM component and its `Icon` is never called here; only the `I`
  // constant is read.)
  // =========================================================================
  const normalise = (d: string): string => d.replace(/\s+/g, ' ').trim();

  const webIcons = readStringDictionary(WEB_ICONS, 'I');
  if (!webIcons) {
    fail(
      '5 icons',
      `cannot read the \`I\` dictionary out of ${WEB_ICONS}. That file is the ` +
        'shared icon vocabulary; if it moved or was renamed, update WEB_ICONS — ' +
        'do not delete the check.',
    );
  }

  const webNames = new Set(Object.keys(webIcons ?? {}));
  const mobileNames = new Set(Object.keys(ICON_PATHS));

  const shared = [...mobileNames].filter((name) => webNames.has(name)).sort();
  const mobileOnly = [...mobileNames].filter((name) => !webNames.has(name)).sort();
  const webOnly = [...webNames].filter((name) => !mobileNames.has(name)).sort();

  const diverging = shared
    .filter((name) => {
      const web = (webIcons ?? {})[name];
      const mobile = (ICON_PATHS as Record<string, string>)[name];
      return web !== undefined && mobile !== undefined && normalise(web) !== normalise(mobile);
    })
    .sort();

  const ledger = new Set(Object.keys(ICON_WEB_DIVERGENCE));

  for (const name of diverging) {
    if (!ledger.has(name)) {
      fail(
        '5 icons',
        `"${name}" is drawn differently on web and mobile but is NOT in ` +
          'ICON_WEB_DIVERGENCE. Either restore the shared path data, or add an ' +
          'entry saying why the two differ. If they are different GLYPHS, they ' +
          'need different NAMES — see `arrow` / `arrowUpRight`.',
      );
    }
  }

  for (const name of ledger) {
    if (!webNames.has(name)) {
      fail(
        '5 icons',
        `ICON_WEB_DIVERGENCE records "${name}", which @fit/ui-web no longer ships. ` +
          'Drop the entry (and move the glyph to ICON_MOBILE_ONLY if it is now mobile-only).',
      );
    } else if (!diverging.includes(name)) {
      fail(
        '5 icons',
        `ICON_WEB_DIVERGENCE records "${name}" as divergent, but the two ` +
          'dictionaries now agree. Delete the entry — a ledger that documents ' +
          'nothing is worse than no ledger.',
      );
    }
  }

  const mobileOnlyLedger = new Set(Object.keys(ICON_MOBILE_ONLY));
  for (const name of mobileOnly) {
    if (!mobileOnlyLedger.has(name)) {
      fail(
        '5 icons',
        `"${name}" exists only in the mobile dictionary and is not declared in ` +
          'ICON_MOBILE_ONLY. Declare it with the screen that needs it, so the two ' +
          'vocabularies cannot fork by accretion.',
      );
    }
  }
  for (const name of mobileOnlyLedger) {
    if (!mobileNames.has(name)) {
      fail(
        '5 icons',
        `ICON_MOBILE_ONLY records "${name}", which the mobile dictionary does not ship.`,
      );
    } else if (webNames.has(name)) {
      fail(
        '5 icons',
        `ICON_MOBILE_ONLY records "${name}" as mobile-only, but @fit/ui-web ships it too. ` +
          'Move it to ICON_WEB_DIVERGENCE if the drawings differ, or drop the entry.',
      );
    }
  }

  // =========================================================================
  // Report.
  // =========================================================================
  if (failures.length > 0) {
    console.error('Design token drift detected:\n');
    for (const f of failures) console.error(`  ${f}`);
    console.error(
      '\nThe design source is `forma-core-app/.workstation/design/_design/tokens.json`\n' +
        '(raw ramps) and `packages/astryx-theme/src/formacoreTheme.ts` (the semantic\n' +
        'layer). Change a colour THERE first, then in `packages/ui-mobile/src/palette.mjs`\n' +
        '— which is the single literal source the mobile preset and runtime both read.',
    );
    process.exit(1);
  }

  const stopCount = SHIPPED_RAMPS.length * Object.keys(palette.ink).length;
  console.log(
    `✓ ${stopCount} colour stop(s) across ${SHIPPED_RAMPS.length} ramp(s) match the design source; ` +
      `${Object.keys(RETIRED_RAMPS).length} retired ramp(s) absent; ` +
      'tailwind.config.base.mjs brand correct; ' +
      `${Object.keys(colorTuples).length} semantic role(s) resolve to the palette; ` +
      `${Object.keys(ICON_PATHS).length} icon(s), ${shared.length} shared with @fit/ui-web ` +
      `(${diverging.length} on the divergence ledger), ${mobileOnly.length} mobile-only` +
      (webOnly.length > 0
        ? `, ${webOnly.length} web-only and not ported: ${webOnly.join(', ')}`
        : '') +
      '.',
  );
}

void main();
