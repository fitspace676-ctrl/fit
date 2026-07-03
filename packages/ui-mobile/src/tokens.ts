// @fit/ui-mobile — runtime design tokens.
//
// The formacore palette + semantic theme, expressed as a runtime object so the
// code that CAN'T use NativeWind `className` — the status bar, the Expo Router
// navigation chrome, chart libraries, `<Animated.View>` styles, `Pressable`
// style callbacks — reads the SAME colors the utility classes generate. The
// className side of these tokens lives in `../tailwind.preset.mjs`; keep the two
// in sync (they intentionally mirror each other, the way the web apps mirror
// their Tailwind config in a runtime map).

/* -------------------------------------------------------------------------- */
/*  Raw palette — the formacore scales shared with the web console + portal.   */
/* -------------------------------------------------------------------------- */

/** A 50→950 colour scale. */
export type Scale = {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
};

/** The full formacore palette. Mirror of `fitMobileTheme.colors`. */
export const palette = {
  brand: {
    50: '#F2F1FE',
    100: '#E8E6FD',
    200: '#D3CFFB',
    300: '#B5AEF7',
    400: '#9184F1',
    500: '#6257E3',
    600: '#5044D2',
    700: '#4536B5',
    800: '#392E92',
    900: '#312A74',
    950: '#1E1A45',
  },
  accent: {
    50: '#ECF1FF',
    100: '#DCE6FF',
    200: '#C0D2FF',
    300: '#96B2FF',
    400: '#6589FF',
    500: '#3B5EF5',
    600: '#2342EB',
    700: '#1B33D8',
    800: '#1C2DAE',
    900: '#1D2C89',
    950: '#151B52',
  },
  ink: {
    50: '#F6F7F9',
    100: '#ECEEF2',
    200: '#D8DCE4',
    300: '#B5BBC8',
    400: '#8A92A4',
    500: '#646D82',
    600: '#4B5468',
    700: '#394155',
    800: '#232838',
    900: '#151926',
    950: '#0B0D15',
  },
  success: {
    50: '#ECFDF3',
    100: '#D1FADF',
    200: '#A6F4C5',
    300: '#6CE9A6',
    400: '#32D583',
    500: '#12B76A',
    600: '#039855',
    700: '#027A48',
    800: '#05603A',
    900: '#054F31',
    950: '#022C1C',
  },
  warning: {
    50: '#FFFAEB',
    100: '#FEF0C7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#7A2E0E',
    950: '#4E1D09',
  },
  danger: {
    50: '#FEF3F2',
    100: '#FEE4E2',
    200: '#FECDCA',
    300: '#FDA29B',
    400: '#F97066',
    500: '#EF4444',
    600: '#D92D20',
    700: '#B42318',
    800: '#912018',
    900: '#7A271A',
    950: '#4E1410',
  },
  info: {
    50: '#EFF8FF',
    100: '#D1E9FF',
    200: '#B2DDFF',
    300: '#84CAFF',
    400: '#53B1FD',
    500: '#2E90FA',
    600: '#1570EF',
    700: '#175CD3',
    800: '#1849A9',
    900: '#194185',
    950: '#102A56',
  },
  iris: {
    50: '#F4F3FF',
    100: '#EBE9FE',
    200: '#D9D6FE',
    300: '#BDB4FE',
    400: '#9B8AFB',
    500: '#7A5AF8',
    600: '#6938EF',
    700: '#5925DC',
    800: '#4A1FB8',
    900: '#3E1C96',
    950: '#27115F',
  },
  flame: {
    50: '#FEF6EE',
    100: '#FDEAD7',
    200: '#F9DBAF',
    300: '#F7B27A',
    400: '#F38744',
    500: '#EF6820',
    600: '#E04F16',
    700: '#B93815',
    800: '#932F19',
    900: '#772917',
    950: '#511C10',
  },
} as const satisfies Record<string, Scale>;

/** Corner radii (px). Mirror of `fitMobileTheme.borderRadius`. */
export const radius = {
  field: 8,
  btn: 12,
  card: 16,
  pill: 9999,
} as const;

/* -------------------------------------------------------------------------- */
/*  Semantic theme — what a screen reads off `useTheme().colors`.              */
/* -------------------------------------------------------------------------- */

/** The semantic colors every screen can read at runtime. */
export interface ThemeColors {
  /** App background. */
  background: string;
  /** Elevated surface — cards, sheets, the tab bar. */
  surface: string;
  /** A raised surface a step above `surface` (nested cards, pressed rows). */
  surfaceRaised: string;
  /** Primary brand / accent. */
  primary: string;
  /** Foreground on a `primary` fill. */
  onPrimary: string;
  /** Foreground text on `background` / `surface`. */
  text: string;
  /** Muted / secondary text. */
  textMuted: string;
  /** Hairline borders and dividers. */
  border: string;
}

/** Light theme — white canvas, ink text, brand-600 accents. */
export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceRaised: palette.ink[50],
  primary: palette.brand[600],
  onPrimary: '#FFFFFF',
  text: palette.ink[900],
  textMuted: palette.ink[500],
  border: palette.ink[200],
};

/** Dark theme — near-black ink canvas, white text, lifted brand-400 accents. */
export const darkColors: ThemeColors = {
  background: palette.ink[950],
  surface: palette.ink[900],
  surfaceRaised: palette.ink[800],
  primary: palette.brand[400],
  onPrimary: palette.ink[950],
  text: '#FFFFFF',
  textMuted: palette.ink[300],
  border: palette.ink[800],
};

/** Pick the semantic palette for a color scheme. */
export function themeColors(isDark: boolean): ThemeColors {
  return isDark ? darkColors : lightColors;
}
