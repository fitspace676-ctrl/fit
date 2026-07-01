/* ────────────────────────────────────────────────────────────────────────
   FormaCore — shared icon set  ·  "Aurora Glass"
   The single-path SVG icon dictionary (`I`) and the tiny `<Icon>` renderer used
   across every marketing surface. Extracted from `marketing-ui` so plain data
   modules (e.g. `@/data/built-for`) can reference icon paths without importing
   the client-only chrome — which would create an import cycle. `marketing-ui`
   re-exports both, so existing `import { I, Icon } from './marketing-ui'` paths
   keep working.
   ──────────────────────────────────────────────────────────────────────── */

export const I = {
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M20 6 9 17l-5-5',
  members:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  calendar:
    'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  qr: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 4h3m-3 3h7v-7h-4v4Z',
  pos: 'M3 6h18M3 6l1.5 12.5a2 2 0 0 0 2 1.5h11a2 2 0 0 0 2-1.5L21 6M9 10v6M15 10v6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2',
  flame: 'M12 2s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3 0 1 1 2 2 2 0-3 2-5 2-8Z',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 7v5l3 2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  globe:
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  menu: 'M3 6h18M3 12h18M3 18h18',
  x: 'M6 6l12 12M18 6 6 18',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2ZM8 11V7a4 4 0 0 1 8 0v4',
  plug: 'M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  card: 'M2 7h20v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7Zm0 4h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2',
  ticket:
    'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8ZM13 6v12',
  store: 'M3 9 4.5 4h15L21 9M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M3 9h18M9 20v-5h6v5',
  grid: 'M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z',
  box: 'M21 8 12 3 3 8m18 0-9 5-9-5m18 0v8l-9 5-9-5V8m9 5v8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  star: 'M12 2l2.9 6.1 6.6.9-4.8 4.7 1.2 6.6L12 17.6 6.1 20.3l1.2-6.6L2.5 9l6.6-.9L12 2Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  minus: 'M5 12h14',
  chevron: 'M6 9l6 6 6-6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.35-4.35',
  stretching: 'M15 5a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M5 20l5-.5 1-2 M18 20v-5h-5.5l2.5-6.5-5.5 1 1.5 2',
  stretching2: 'M6.5 21l3.5-5 M5 11l7-2 M16 21l-4-7v-5l7-4 M9.007 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  barbell:
    'M2 12h1 M6 8h-2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2 M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1 M9 12h6 M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-10a1 1 0 0 0-1-1h-1a1 1 0 0 0-1 1 M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2 M22 12h-1',
  karate:
    'M3 9l4.5 1 3 2.5 M13 21v-8l3-5.5 M8 4.5l4 2 4 1 4 3.5-2 3.5 M15.007 5a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  swimming:
    'M15 9a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M6 11l4-2 3.5 3-1.5 2 M3 16.75a2.4 2.4 0 0 0 1 .25 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 2-1 2.4 2.4 0 0 1 2-1 2.4 2.4 0 0 1 2 1 2.4 2.4 0 0 0 2 1 2.4 2.4 0 0 0 1-.25',
  vinyl:
    'M16 3.937a9 9 0 1 0 5 8.063 M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M19 4a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M20 4l-3.5 10-2.5 2',
  padel:
    'M9 4.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11 M12.9 13.9l3.6 3.6a2 2 0 0 1-2.8 2.8l-3.6-3.6 M18.5 5a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 1 0 0-2.8',
} satisfies Record<string, string>;

export const Icon = ({ d, c = 'w-5 h-5', sw = 2 }: { d: string; c?: string; sw?: number }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={c}
  >
    {d.split(' M').map((seg, i) => (
      <path key={i} d={i === 0 ? seg : 'M' + seg} />
    ))}
  </svg>
);
