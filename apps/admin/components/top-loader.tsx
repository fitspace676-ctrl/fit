'use client';

// @fit/admin — top navigation progress bar.
//
// A thin brand-colored line that fills across the top of the viewport during
// App Router navigations. `nextjs-toploader` handles the fiddly bits (patching
// `history.pushState`, intercepting anchor clicks, completing on route commit);
// we only feed it the Fit look. The color is driven by `--color-accent` — the
// theme-aware electric-indigo accent (#6257E3 light / #9184F1 dark) — so the
// bar always fills in our brand color and follows the light/dark skin.

import NextTopLoader from 'nextjs-toploader';

export function TopLoader() {
  return (
    <NextTopLoader
      color="var(--color-accent)"
      height={3}
      shadow="0 0 10px var(--color-accent), 0 0 5px var(--color-accent)"
      showSpinner={false}
      crawlSpeed={200}
      speed={300}
    />
  );
}
