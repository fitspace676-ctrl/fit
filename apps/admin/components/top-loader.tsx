'use client';

// @fit/admin — top navigation progress bar.
//
// A thin brand-colored line that fills across the top of the viewport during
// App Router navigations. `nextjs-toploader` handles the fiddly bits (patching
// `history.pushState`, intercepting anchor clicks, completing on route commit);
// we only feed it the Fit look: the flat brand accent in both modes, same as
// the member portal. The glow shadow follows `--color-accent` too.

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
