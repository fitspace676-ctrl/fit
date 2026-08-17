import preset from '@fit/config/tailwind';

/**
 * Admin Tailwind config — FormaCore "Lime Block".
 *
 * Extends the shared @fit/config theme, then layers the console's design tokens
 * on top. `darkMode: 'class'` drives the light/dark toggle.
 *
 * WHY THIS FILE STILL EXISTS. The console is mid-migration onto `@fit/ui-kit` +
 * Astryx; ~40 files still author `className=`. This config is what keeps those
 * on-brand meanwhile, so its values are a DELIBERATE MIRROR of
 * `packages/astryx-theme/src/formacoreTheme.ts` — the same ink ramp, the same
 * lime, the same radius ladder. When a token changes it changes in both, and
 * when the last file migrates this file is deleted. (`apps/web` carries the same
 * mirror for the same reason.)
 *
 * It used to mirror `fitTheme` instead — the Aurora-glass electric indigo. That
 * moved with the theme swap, or the two halves of every half-migrated screen
 * would have disagreed: Astryx chrome in lime, the Tailwind body still indigo.
 *
 * @type {import('tailwindcss').Config}
 */

/** The warm charcoal neutral — the whole palette apart from the lime and the red. */
const ink = {
  50: '#F7F7F6',
  100: '#EEEEED',
  200: '#DCDCDA',
  300: '#BABAB7',
  400: '#8F8F8B',
  500: '#6C6C68',
  600: '#53534F',
  700: '#3E3E3B',
  800: '#2B2B29',
  900: '#1E1E1C',
  950: '#131312',
};
export default {
  presets: [preset],
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    // Generate the utility classes used by the shared design-system package so
    // its primitives render fully styled here (T1.3).
    '../../packages/ui-web/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // The lime. `300` is the block colour — the primary action and nothing
        // else. The deeper stops exist so lime-as-ink stays legible on white
        // (`300` on white is ~1.3:1), which is why text and links take `800`.
        // Anything on a lime fill is `ink-950`.
        brand: {
          50: '#FBFEE9',
          100: '#F6FCC9',
          200: '#EFF9A2',
          300: '#E4F26A',
          400: '#D6E844',
          500: '#C2D625',
          600: '#A3B71C',
          700: '#7D8C1B',
          800: '#63701D',
          900: '#525C1E',
          950: '#2C330A',
        },
        // Retired by the direction — aliased to ink so surviving call sites go
        // neutral rather than reintroducing a second hue. Delete with them.
        accent: ink,
        ink,
        // Sentiment collapses onto the signals the direction allows: positive is
        // the lime, pending/neutral is ink, and red is the one exception. Keeping
        // the token NAMES (rather than deleting them) means a `success-500` left
        // in an unmigrated screen renders as lime instead of a green that would
        // compete with the accent for the eye.
        success: {
          50: '#FBFEE9',
          100: '#F6FCC9',
          200: '#EFF9A2',
          300: '#E4F26A',
          400: '#D6E844',
          500: '#C2D625',
          600: '#A3B71C',
          700: '#7D8C1B',
          800: '#63701D',
          900: '#525C1E',
          950: '#2C330A',
        },
        warning: ink,
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
        // Teal rounds the categorical hues out to four that carry no status
        // meaning (iris / info / teal / flame), which is what the staff-role
        // swatches key off — see app/(dashboard)/staff/role-meta.ts.
        teal: {
          50: '#F0FDF9',
          100: '#CCFBEF',
          200: '#99F6E0',
          300: '#5FE9D0',
          400: '#2ED3B7',
          500: '#15B79E',
          600: '#0E9384',
          700: '#107569',
          800: '#125D56',
          900: '#134E48',
          950: '#0A2926',
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
      },
      fontFamily: {
        // One family for body AND display — Georgian and Latin on the same
        // skeleton at every weight. Manrope/Archivo had no Georgian coverage and
        // fell back mid-page. JetBrains Mono carries the numerals, which the
        // direction treats as its primary visual accent.
        sans: [
          'var(--font-noto-georgian)',
          'Noto Sans Georgian',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        display: [
          'var(--font-noto-georgian)',
          'Noto Sans Georgian',
          'Inter',
          'system-ui',
          'sans-serif',
        ],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // The cut-corner ladder, rounded — mirrors the theme's
        // `--radius-inner / element / container / page`.
        field: '0.875rem',
        btn: '0.875rem',
        chip: '0.625rem',
        card: '1.625rem',
        block: '2rem',
        pill: '9999px',
      },
    },
  },
};
