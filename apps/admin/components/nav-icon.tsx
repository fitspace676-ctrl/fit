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
  workouts: 'M6.5 6.5v11M17.5 6.5v11M4 9.5h2.5M17.5 9.5H20M6.5 12h11',
  billing: 'M3 7h18v10H3zM3 11h18M7 15h2',
  staff: 'M12 11a3 3 0 100-6 3 3 0 000 6zM5 20a7 7 0 0114 0',
  reports: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 12a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 00-2-1.2L16.5 2h-4l-.4 2.6a7.3 7.3 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 002 1.2l.4 2.6h4l.4-2.6a7.3 7.3 0 002-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2z',
};

/** Render the inline glyph for `name`; inherits `currentColor`. */
export function NavIcon({ name }: { name: NavIconKey }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
