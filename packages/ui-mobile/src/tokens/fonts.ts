// Fonts — which families are bundled, under what names, and how they load.
//
// ===========================================================================
// WHY EACH WEIGHT IS ITS OWN FAMILY NAME (decision D5 + Q4)
//
// React Native does not synthesise weights for a custom family on Android. On
// iOS `fontFamily: 'JetBrains Mono'` + `fontWeight: '700'` picks the bold face
// out of the family; on Android the same pair renders the REGULAR face, because
// the platform matches a bundled font by its exact PostScript name and has no
// fallback weight-matching for non-system families. There is no flag for this.
//
// So each weight is registered as a separate family and the weight is baked
// into the name. `typography.ts` therefore emits `fontFamily` and — for the
// bundled families — deliberately OMITS `fontWeight`, because setting both is
// how you get a double-bolded face on iOS and a wrong one on Android.
//
// WHAT IS BUNDLED, AND WHAT IS NOT
//
// JetBrains Mono 400/500/600/700 — four faces. The mono numerals are the
// direction's signature accent at 26-34px (`mobile-home-v2.tsx` crops a 30px
// mono time off the edge of the class block), and there is no system mono on
// either platform that looks like it.
//
// Noto Sans Georgian 700/800 — two faces, HEADINGS ONLY. Decision D5 puts body
// text on the system sans (San Francisco / Roboto), which is the right call: it
// is free, it is what the user's accessibility settings already tune, and both
// platforms cover Georgian at body weights. But Roboto has no 800, and roughly
// 40 nodes across the six artboards are `font-extrabold` — every screen title,
// every stat number, the membership block's headline. Left to the system, all
// of them render at 700 on Android and the direction's display weight, which is
// most of what makes the type read as this product, is quietly lost. Two static
// faces (~40KB each subset) buy it back.
//
// Static faces rather than the variable file: RN's `fontWeight` cannot drive a
// variable axis on either platform, so a variable Noto would still need to be
// instanced at build time — at which point it is two static files with extra
// steps and a 180KB download.
//
// The six binaries ARE in the repo, under `assets/fonts/`, with each family's
// OFL text beside them. `assets/fonts/README.md` records where they came from
// and why these six weights and no others.
//
// If one is ever removed, the failure is a **Metro build error**, not a runtime
// fallback — `fontAssetMap()` below `require()`s each by a static string, and
// Metro resolves asset requires at build time. An earlier version of this
// comment claimed a missing file would surface as `loaded: false` with an
// error; it does not, and believing that costs an afternoon. The hard failure
// is deliberate: a lazy require or a silent system-font fallback is exactly how
// the previous package shipped an emoji tab icon into a design system whose own
// gallery says "no emoji".
// ===========================================================================

/**
 * The registered family names.
 *
 * These strings are what goes into `fontFamily` at runtime, and they must match
 * the KEYS in {@link fontAssets} — `expo-font` registers a face under the key it
 * was loaded with, not under the file's internal name.
 */
export const fontFamilies = {
  /** JetBrains Mono. `mono700` carries the giant cropped numerals. */
  mono400: 'JetBrainsMono-Regular',
  mono500: 'JetBrainsMono-Medium',
  mono600: 'JetBrainsMono-SemiBold',
  mono700: 'JetBrainsMono-Bold',
  /** Noto Sans Georgian, headings only. */
  sans700: 'NotoSansGeorgian-Bold',
  sans800: 'NotoSansGeorgian-ExtraBold',
} as const;

/** A registered family name. */
export type FontFamilyName = (typeof fontFamilies)[keyof typeof fontFamilies];

/**
 * The numeric weights `typography.ts` may ask for.
 *
 * 100-300 are not in the list because the direction never uses them — the
 * lightest thing on any artboard is `font-medium` body copy.
 */
export type FontWeightValue = '400' | '500' | '600' | '700' | '800';

/**
 * The exact filenames `assets/fonts/` must contain. Data, so the README, the
 * require map and any future asset check all read the same list.
 */
export const FONT_FILES = {
  [fontFamilies.mono400]: 'JetBrainsMono-Regular.ttf',
  [fontFamilies.mono500]: 'JetBrainsMono-Medium.ttf',
  [fontFamilies.mono600]: 'JetBrainsMono-SemiBold.ttf',
  [fontFamilies.mono700]: 'JetBrainsMono-Bold.ttf',
  [fontFamilies.sans700]: 'NotoSansGeorgian-Bold.ttf',
  [fontFamilies.sans800]: 'NotoSansGeorgian-ExtraBold.ttf',
} as Record<string, string>;

/**
 * The `require()` map `expo-font` wants.
 *
 * TWO THINGS ABOUT THE SHAPE OF THIS FUNCTION.
 *
 * It is six hand-written lines rather than a loop over {@link FONT_FILES}
 * because Metro resolves an asset `require()` at BUILD time from a static
 * string literal. A computed path (``require(`../../assets/fonts/${f}`)``)
 * bundles nothing and fails at runtime with "unknown module". Adding a face
 * means editing here as well as there; `assets/fonts/README.md` says so.
 *
 * It is a FUNCTION rather than a top-level object so that importing this module
 * from Node — which `tokens.spec.ts` and `scripts/check-design-tokens.ts` do,
 * transitively, through `typography.ts` — does not try to read a `.ttf` through
 * Node's resolver and throw. Metro collects `require()` calls anywhere in a
 * module, nested or not, so the bundling behaviour is unchanged.
 *
 * NOTE: the six binaries are not in the repo (they cannot be — they are
 * upstream-licensed files, not source). Until a human drops them in, the Metro
 * build FAILS on the first of these lines. That failure is deliberate and loud:
 * the alternative, a silent system-font fallback, is exactly the class of thing
 * that shipped a "no emoji" design system with an emoji in it.
 */
export function fontAssetMap(): Record<string, number> {
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [fontFamilies.mono400]: require('../../assets/fonts/JetBrainsMono-Regular.ttf') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [fontFamilies.mono500]: require('../../assets/fonts/JetBrainsMono-Medium.ttf') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [fontFamilies.mono600]: require('../../assets/fonts/JetBrainsMono-SemiBold.ttf') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [fontFamilies.mono700]: require('../../assets/fonts/JetBrainsMono-Bold.ttf') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [fontFamilies.sans700]: require('../../assets/fonts/NotoSansGeorgian-Bold.ttf') as number,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    [fontFamilies.sans800]: require('../../assets/fonts/NotoSansGeorgian-ExtraBold.ttf') as number,
  };
}

/**
 * Resolve the mono family for a weight. Every mono weight is bundled, so this
 * always returns a family name and callers must not also set `fontWeight`.
 */
export function monoFamily(weight: FontWeightValue): FontFamilyName {
  switch (weight) {
    case '400':
      return fontFamilies.mono400;
    case '500':
      return fontFamilies.mono500;
    case '600':
      return fontFamilies.mono600;
    default:
      // 700 and 800 both land on Bold — JetBrains Mono ships no ExtraBold, and
      // the artboards never ask for one in mono.
      return fontFamilies.mono700;
  }
}

/**
 * Resolve the sans family for a weight.
 *
 * Returns `undefined` for 400/500/600 — that is not a gap, it is decision D5:
 * body copy rides the SYSTEM sans, and the way to say "system" in RN is to omit
 * `fontFamily` and let `fontWeight` do its normal job. Only the two heading
 * weights are bundled, and for those the caller must set `fontFamily` and NOT
 * `fontWeight`.
 *
 * `typography.ts` encodes exactly that rule in one place; nothing else in the
 * package should be calling this directly.
 */
export function sansFamily(weight: FontWeightValue): FontFamilyName | undefined {
  if (weight === '700') return fontFamilies.sans700;
  if (weight === '800') return fontFamilies.sans800;
  return undefined;
}

/** What {@link useFormacoreFonts} reports back. */
export interface FontLoadState {
  /** True once every face above is registered and it is safe to hide the splash. */
  loaded: boolean;
  /**
   * The load error, if any. Almost always "the binaries are not in
   * `assets/fonts/` yet" — see that directory's README.
   */
  error: Error | null;
}

/**
 * Load every bundled face. Call it ONCE, in the root layout, and keep the
 * splash screen up until it reports `loaded` (or `error`).
 *
 * ```tsx
 * const { loaded, error } = useFormacoreFonts();
 * useEffect(() => {
 *   if (loaded || error) void SplashScreen.hideAsync();
 * }, [loaded, error]);
 * if (!loaded && !error) return null;
 * ```
 *
 * WHY THE SPLASH GATE IS NOT OPTIONAL. `useFonts` renders once with the faces
 * missing and again once they are registered. Without the gate, the first frame
 * paints every heading in the system sans at whatever weight it can manage and
 * then reflows — on Georgian text, whose glyph advances differ substantially
 * between Roboto and Noto Sans Georgian, that reflow moves lines, not pixels.
 *
 * WHY IT RETURNS ON ERROR RATHER THAN RETRYING. A missing face is a packaging
 * bug, not a network condition; `expo-font` reads from the bundle. Retrying
 * would hold the splash forever on a broken build. Rendering with the system
 * fallback and reporting the error gets a usable app plus a Sentry breadcrumb.
 */
export function useFormacoreFonts(): FontLoadState {
  // `expo-font` is required lazily, and typed structurally rather than with
  // `typeof import('expo-font')`, for two reasons:
  //
  //   - This module has to stay importable from Node, so `tokens.spec.ts` and
  //     `scripts/check-design-tokens.ts` can read the family names without an
  //     RN runtime. Metro bundles a nested `require` exactly like a top-level
  //     import, so nothing about the app build changes.
  //   - `expo-font` is a PEER of this package (the app owns the Expo SDK
  //     version), so its types are not guaranteed to be resolvable while
  //     type-checking the package in isolation. The one function used is
  //     declared inline instead.
  //
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useFonts } = require('expo-font') as {
    useFonts: (map: Record<string, number>) => [boolean, Error | null];
  };
  const [loaded, error] = useFonts(fontAssetMap());
  return { loaded, error: error ?? null };
}
