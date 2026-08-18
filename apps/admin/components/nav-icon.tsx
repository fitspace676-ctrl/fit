'use client';

// @fit/admin — inline nav icons.
//
// A tiny set of outline (heroicons-style) glyphs keyed by `NavIcon`, kept inline
// so the sidebar needs no icon dependency. Each is a 20×20 stroke path.
//
// The stroke's paint depends on the theme. In dark mode it is the raw brand
// lime (#E4F26A) - the phosphor the whole dark console glows in - stated as a
// literal so neither an Astryx scope nor the palette playground can shift it.
// In light mode it is the console's brand gradient - a radial sweep from the
// deep green (#307654, top-left) out to the phosphor lime (#e4f26a) - because
// flat ink there read as plain grey chrome and the raw lime alone is invisible
// on the light rail. Each svg carries its own `<radialGradient>` def keyed by
// `useId`, so any number of icons (rail, drawer, collapsed strip) coexist
// without id collisions.

import { useId } from 'react';
import type { NavIcon as NavIconKey } from '@/lib/nav';
import { useTheme } from '@/components/theme/theme-provider';

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
  automation: 'M13 3L5 13.5h5L10 21l8-10.5h-5L13 3z',
  marketing: 'M11 5L6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
  loyalty:
    'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 110-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 100-5C13 2 12 7 12 7z',
  analytics: 'M4 4v16h16M8 14l3-4 3 3 4-6',
  reports: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  activity: 'M3 12h4l2 7 4-16 2 9h6',
  audit:
    'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  // Sliders, not a cog — and the same glyph `@fit/ui-web`'s `settings` icon uses,
  // so the rail and every in-page Settings affordance read as one thing. The
  // twelve-notch gear this replaced turned to mush at the rail's 20px.
  settings:
    'M4 7h9M17 7h3M4 17h3M11 17h9M15 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM9 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
};

/**
 * Render the inline glyph for `name`. Strokes the flat brand lime in dark mode;
 * in light mode the path strokes the brand gradient defined alongside it.
 * `size` is the rendered square in px - the rail's rows use the 20px default,
 * chrome slots (the top bar's location pin) pass their own.
 */
export function NavIcon({ name, size = 20 }: { name: NavIconKey; size?: number }) {
  const { theme } = useTheme();
  // `useId` yields a document-unique, SSR-safe id; strip the framework's `:`
  // delimiters so it is a valid `url(#…)` fragment reference.
  const gradientId = `nav-icon-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const gradient = theme === 'light';

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {gradient ? (
        <defs>
          {/* The CSS `radial-gradient(at 0% 0%, #307654, #e4f26a)` restated in
              SVG terms: centred on the glyph's top-left corner, reaching the
              lime at the far corner (r = sqrt(2) of the bounding box). */}
          <radialGradient id={gradientId} cx="0" cy="0" r="1.4142">
            <stop offset="0" stopColor="#307654" />
            <stop offset="1" stopColor="#e4f26a" />
          </radialGradient>
        </defs>
      ) : null}
      <path d={ICON_PATHS[name]} stroke={gradient ? `url(#${gradientId})` : '#E4F26A'} />
    </svg>
  );
}
