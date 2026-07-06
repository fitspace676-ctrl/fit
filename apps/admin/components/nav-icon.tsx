// @fit/admin — inline nav icons.
//
// A tiny set of outline (heroicons-style) glyphs keyed by `NavIcon`, kept inline
// so the sidebar needs no icon dependency. Each is a 20×20 `currentColor` stroke
// path, so it inherits the link's text color (active vs. idle) for free.

import type { NavIcon as NavIconKey } from '@/lib/nav';

/** SVG `d` paths per icon key. */
const ICON_PATHS: Record<NavIconKey, string> = {
  dashboard: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  members:
    'M9 7a3 3 0 11-6 0 3 3 0 016 0zM17 11a3 3 0 100-6 3 3 0 000 6zM2 20a5 5 0 0110 0M14 20a5 5 0 015-5',
  trainers: 'M12 11a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0M9 7h6',
  checkin:
    'M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h2v2h-2v-2zM18 14h2v2h-2v-2zM14 18h2v2h-2v-2zM18 18h2v2h-2v-2z',
  locations: 'M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 12a3 3 0 100-6 3 3 0 000 6z',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  pos: 'M5 8h14v12H5zM5 8l1.5-4h11L19 8M9 12h6M9 16h3',
  orders: 'M7 3h10l1 4H6l1-4zM6 7h12v13a1 1 0 01-1 1H7a1 1 0 01-1-1V7zM9 11h6',
  packages: 'M3 8.5l2-3.5h14l2 3.5M3 8.5h18M3 8.5V19a1 1 0 001 1h16a1 1 0 001-1V8.5M9.5 12h5',
  subscriptions: 'M21 12a9 9 0 11-2.64-6.36M21 4v4h-4',
  classes: 'M4 5h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zM3 10h18M8 3v4M16 3v4',
  workouts: 'M6.5 6.5v11M17.5 6.5v11M4 9.5h2.5M17.5 9.5H20M6.5 12h11',
  billing: 'M3 7h18v10H3zM3 11h18M7 15h2',
  staff: 'M12 11a3 3 0 100-6 3 3 0 000 6zM5 20a7 7 0 0114 0',
  analytics: 'M4 4v16h16M8 14l3-4 3 3 4-6',
  reports: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  activity: 'M3 12h4l2 7 4-16 2 9h6',
  audit:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 12a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 00-2-1.2L16.5 2h-4l-.4 2.6a7.3 7.3 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 002 1.2l.4 2.6h4l.4-2.6a7.3 7.3 0 002-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z',
};

/** Render the inline glyph for `name`; inherits `currentColor`. */
export function NavIcon({ name }: { name: NavIconKey }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
