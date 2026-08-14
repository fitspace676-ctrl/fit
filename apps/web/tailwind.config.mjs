import preset from '@fit/config/tailwind';

/**
 * Web Tailwind config — FormaCore "Lime Block".
 *
 * Extends the shared @fit/config theme, then layers the member-portal design
 * tokens on top. `darkMode: 'class'` drives the portal's light/dark toggle — the
 * `<html>` element gets a `dark` class from the ThemeProvider and every Tailwind
 * surface reads it via `dark:` variants.
 *
 * WHY THIS FILE STILL EXISTS. apps/web is nearly through the Astryx + StyleX
 * migration (docs/tailwind-decommission.md): 58 files are on Astryx, and the
 * handful still authoring `className=` are the member shell (header, footer, tab
 * bar, theme toggle) plus three `src/components/ui` helpers. This config is what
 * keeps those last files on-brand during coexistence, so its values are a
 * DELIBERATE MIRROR of `packages/astryx-theme/src/formacoreTheme.ts` — the same
 * ink ramp, the same lime, the same radius ladder. When a token changes it
 * changes in both, and when the last file migrates this file is deleted.
 *
 * The direction, in short: a warm charcoal ink ramp, exactly one chromatic voice
 * (lime `brand-300`), and red as the single functional exception. `accent` and
 * `iris` are retained ONLY as aliases of `ink` — the design retired them, and
 * aliasing rather than deleting means the stray `iris-500` left in the shell
 * renders as a neutral instead of breaking the build. Both go when those call
 * sites do.
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
    './src/**/*.{ts,tsx,mdx}',
    // Generate the utility classes used by the shared design-system package so
    // its primitives render fully styled here (T1.3).
    '../../packages/ui-web/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // The lime. `300` is the block colour — the membership, the primary
        // action, a confirmed booking, and nothing else. The deeper stops exist
        // so lime-as-ink stays legible on white (`300` on white is ~1.3:1, so
        // text and links take `700`). Anything on a lime fill is `ink-950`.
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
        ink,
        // Retired by the direction — aliased to ink so surviving call sites go
        // neutral rather than reintroducing a second hue. Delete with them.
        accent: ink,
        iris: ink,
        // Red is the one functional colour the direction keeps: payment failed,
        // destructive action, hard error. Nothing decorative uses it.
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
        // Sentiment collapses onto the two signals the direction allows: a
        // positive state is the lime, a pending/neutral one is ink. Keeping the
        // token names (rather than deleting them) means a `success-500` left in
        // the shell renders as lime instead of a green that would compete with
        // the membership block for the eye.
        success: {
          ...{ 50: '#FBFEE9', 100: '#F6FCC9', 200: '#EFF9A2', 300: '#E4F26A' },
          400: '#D6E844',
          500: '#C2D625',
          600: '#A3B71C',
          700: '#7D8C1B',
          800: '#63701D',
          900: '#525C1E',
          950: '#2C330A',
        },
        warning: ink,
        info: ink,
        flame: ink,
      },
      fontFamily: {
        // One family for body and display — Georgian and Latin on the same
        // skeleton at every weight. Loaded by app/[locale]/layout.tsx.
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
        // `--radius-inner / element / container / page`. `field` and `btn` both
        // resolve to the element step (the artboards give controls one
        // silhouette); `card` is the 26px panel and `block` the 32px hero.
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
