'use client';

// @fit/admin — top navigation progress bar.
//
// A thin brand-colored line that fills across the top of the viewport during
// App Router navigations. `nextjs-toploader` handles the fiddly bits (patching
// `history.pushState`, intercepting anchor clicks, completing on route commit);
// we only feed it the Fit look. The `color` prop is only the fallback: the
// bar's real paint is set per mode in globals.css (`#nprogress .bar`) - the
// brand gradient in light, the flat phosphor lime in dark - because one prop
// cannot say both. The glow shadow below still follows `--color-accent`.

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
