import preset from '@fit/config/tailwind';

/**
 * The marketing page builds Tailwind classes from a runtime `tone` value
 * (`bg-${tone}-500/15`, `from-${tone}-400/25`, …), which the JIT compiler can't
 * see in source. Every tone × utility combination produced that way is
 * enumerated here so the classes survive the production purge. Keep this in
 * sync with the dynamic class strings in `components/marketing/`.
 */
const DYNAMIC_TONES = ['brand', 'iris', 'accent', 'success', 'warning', 'danger', 'flame'];
const safelist = DYNAMIC_TONES.flatMap((tone) => [
  `bg-${tone}-400`,
  `bg-${tone}-500`,
  `bg-${tone}-500/[0.12]`,
  `bg-${tone}-500/15`,
  `ring-${tone}-500/25`,
  `ring-${tone}-500/30`,
  `text-${tone}-200`,
  `text-${tone}-300`,
  `text-${tone}-400`,
  `from-${tone}-400/25`,
  `from-${tone}-400/30`,
  `to-${tone}-600/10`,
  `to-${tone}-600/15`,
  // Light-theme shades of the runtime tone text + their dark: counterparts.
  `text-${tone}-500`,
  `text-${tone}-600`,
  `text-${tone}-700`,
  `dark:text-${tone}-300`,
  `dark:text-${tone}-400`,
]);

/**
 * Platform Tailwind config — the apex marketing surface (formacore.io) follows
 * the dedicated "Marketing / platform" design rather than the shared @fit blue
 * brand, so the design's own token set (indigo `brand`, `accent`, `ink`, the
 * status ramps, and the Manrope/Archivo type pairing) is layered on top of the
 * shared preset here. The preset still supplies `px-gutter` and anything not
 * overridden below.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    './registry/**/*.{ts,tsx,mdx}',
  ],
  // The landing ships both a dark and a light theme; `.dark` on <html> selects
  // dark. The semantic tokens below resolve to CSS variables (see globals.css)
  // so a single class set drives both themes. Dark values equal the original
  // design exactly; light is the tuned inversion.
  darkMode: 'class',
  safelist,
  theme: {
    extend: {
      colors: {
        // Theme-aware semantic tokens (CSS vars, alpha-enabled).
        surface: 'rgb(var(--surface) / <alpha-value>)', // page canvas
        fg: 'rgb(var(--fg) / <alpha-value>)', // primary text
        strong: 'rgb(var(--strong) / <alpha-value>)', // emphasized secondary text
        muted: 'rgb(var(--muted) / <alpha-value>)', // body secondary text
        faint: 'rgb(var(--faint) / <alpha-value>)', // captions
        subtle: 'rgb(var(--subtle) / <alpha-value>)', // labels / meta
        dim: 'rgb(var(--dim) / <alpha-value>)', // faintest text
        overlay: 'rgb(var(--overlay) / <alpha-value>)', // glass fills / hairlines
        panel: 'rgb(var(--panel) / <alpha-value>)', // inset / mock surfaces
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
      },
      fontFamily: {
        sans: ['var(--font-manrope)', 'Manrope', 'system-ui', 'sans-serif'],
        display: ['var(--font-archivo)', 'Archivo', 'var(--font-manrope)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        btn: '0.75rem',
        card: '1rem',
        pill: '9999px',
      },
      // Marquee primitive (registry/magicui/marquee) — scroll distance is
      // 100% of the duplicated track plus one inter-item gap, so the loop is
      // seamless. Speed is driven per-instance via the `--duration` CSS var.
      keyframes: {
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(calc(-100% - var(--gap)))' },
        },
        'marquee-vertical': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(calc(-100% - var(--gap)))' },
        },
      },
      animation: {
        marquee: 'marquee var(--duration) linear infinite',
        'marquee-vertical': 'marquee-vertical var(--duration) linear infinite',
      },
    },
  },
};
