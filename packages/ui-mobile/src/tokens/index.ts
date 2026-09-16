// The token layer's barrel.
//
// NOTE ON IMPORT WEIGHT. `./theme` pulls in `react`, `react-native/useColorScheme`
// and the JSX runtime, so importing this barrel is not free in a Node process.
// `tokens.spec.ts` and `scripts/check-design-tokens.ts` therefore import the
// leaf modules (`./semantic`, `../palette`) directly rather than going through
// here — that is what keeps the token specs on Vitest instead of jest-expo, per
// the test strategy's one hard boundary.

export {
  palette,
  ink,
  brand,
  danger,
  white,
  transparent,
  isPaletteValue,
  PALETTE_VALUES,
  RAMP_NAMES,
  RAMP_STOPS,
  RETIRED_RAMPS,
  type Ramp,
  type RampName,
  type RampStop,
} from '../palette';

export {
  colorTuples,
  themeColors,
  lightColors,
  darkColors,
  COLOR_ROLES,
  RGBA_ALLOWLIST,
  type ColorRole,
  type ThemeColors,
} from './semantic';

export {
  radii,
  clampRadius,
  CUT_TO_RADIUS,
  PASSTHROUGH_RADII,
  RADIUS_NAMES,
  RADIUS_MAX,
  type RadiusName,
  type SurfaceRadius,
} from './radii';

export { spacing, layout, type SpacingStep } from './spacing';

export { type, em, tabularNums, TYPE_ROLES, type TypeRole, type TypeStyle } from './typography';

export {
  shadowsFor,
  lightShadows,
  darkShadows,
  SHADOW_NAMES,
  type ShadowName,
  type Shadows,
  type ShadowStyle,
} from './shadows';

export {
  fontFamilies,
  fontAssetMap,
  useFormacoreFonts,
  monoFamily,
  sansFamily,
  FONT_FILES,
  type FontFamilyName,
  type FontLoadState,
  type FontWeightValue,
} from './fonts';

export {
  ThemeProvider,
  useTheme,
  useThemeColors,
  type Theme,
  type ThemeProviderProps,
  type ThemeScheme,
} from './theme';
