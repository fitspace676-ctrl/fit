'use client';

// @fit/admin — the active branch, available to every client component.
//
// The top-bar switcher used to hold its selection in `useState` + `localStorage`
// and nothing read it. That was not a missing wire: every console page is a
// Server Component fetching through `lib/api.ts`, and `localStorage` does not
// exist on the server, so the value structurally could not reach a fetch. It also
// restored itself in a `useEffect`, which meant the bar painted "All locations"
// on first frame and then flipped to the real branch a tick later.
//
// Both problems have the same fix: the selection lives in a cookie, the server
// resolves it before anything renders, and this provider is seeded with the
// answer — exactly the `GymCurrencyProvider` shape (`components/gym-currency.tsx`),
// for exactly the same reason. First paint is already correct.
//
// WHY THE URL IS RECONCILED HERE AND NOT IN THE LAYOUT. `?locationId=` outranks
// the cookie (see `lib/active-location.ts`), but the App Router does not hand
// `searchParams` to a layout — only to a page. `useSearchParams()` does see them,
// on the server render as well as in the browser, so the override is applied on
// this side of the boundary and the seeded cookie value is the fallback. A page
// calling `getActiveLocationId(searchParams)` independently reaches the same
// answer from the same two inputs.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ACTIVE_LOCATION_COOKIE,
  ALL_LOCATIONS,
  LOCATION_PARAM,
  locationFilter,
  resolveActiveLocation,
  type LocationRef,
} from '@/lib/active-location';

/** A gym location as the switcher renders it. */
export interface ActiveLocationOption extends LocationRef {
  id: string;
  name: string;
}

export interface ActiveLocationValue {
  /** As the UI spells it: {@link ALL_LOCATIONS} or a live location id. */
  active: string;
  /** As the API wants it: `undefined` for "all branches". */
  locationId: string | undefined;
  /** The gym's live branches, in the order the switcher lists them. */
  locations: readonly ActiveLocationOption[];
  /** Persist a new choice: cookie, URL, and a refetch of the server tree. */
  setActive: (next: string) => void;
}

const ActiveLocationContext = createContext<ActiveLocationValue>({
  active: ALL_LOCATIONS,
  locationId: undefined,
  locations: [],
  setActive: () => {},
});

/** One year, in seconds — how long a branch choice is remembered. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Seed the active branch for the console. `initial` is the cookie's resolved
 * value from the server (`getActiveLocation()`), so the first client render
 * already shows the right branch and nothing flashes "All locations".
 */
export function ActiveLocationProvider({
  initial,
  locations,
  children,
}: {
  initial: string;
  locations: readonly ActiveLocationOption[];
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // What the request itself says the branch is: the URL override if there is one,
  // otherwise the cookie the server already resolved for us.
  const fromRequest = resolveActiveLocation(
    searchParams.get(LOCATION_PARAM) ?? undefined,
    initial,
    locations,
  );

  // The control has to move the instant it is clicked, but the value it moves to
  // only becomes true once the navigation lands — so the chosen value is held
  // optimistically here, and `seen` records which request value that optimism was
  // layered on top of. Adjusting state during render (rather than in an effect)
  // is what keeps the two in step without a frame of the wrong branch:
  //
  //  • Picking a branch pushes `?locationId=…`; until that round trip returns,
  //    `fromRequest` is still the old branch — but `seen` is too, so the optimism
  //    stands.
  //  • Picking "All locations" REMOVES the param, so `fromRequest` falls back to
  //    the cookie — which is stale until `router.refresh()` re-renders the layout.
  //    Same guard covers it, with no flicker back to the old branch.
  //  • A real move — the back button, or a page-local control writing the param —
  //    changes `fromRequest` away from `seen`, and that is when we adopt it.
  const [choice, setChoice] = useState({ active: fromRequest, seen: fromRequest });
  if (choice.seen !== fromRequest) {
    setChoice({ active: fromRequest, seen: fromRequest });
  }

  const search = searchParams.toString();

  const setActive = useCallback(
    (next: string) => {
      setChoice((prev) => ({ active: next, seen: prev.seen }));

      // Year-long cookie so the next server render — on this page and every page
      // navigated to afterwards, none of whose links carry the param — scopes to
      // the same branch.
      try {
        document.cookie = `${ACTIVE_LOCATION_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
      } catch {
        // Storage disabled — the choice still applies to this navigation via the
        // URL below; it just will not outlive the tab.
      }

      // Keep the branch in the URL so the view stays shareable and the back button
      // restores it. "All locations" is the absence of the param, never
      // `locationId=all` — the API is never asked to interpret the sentinel.
      const params = new URLSearchParams(search);
      if (next === ALL_LOCATIONS) {
        params.delete(LOCATION_PARAM);
      } else {
        params.set(LOCATION_PARAM, next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);

      // `replace` alone is not enough. Deselecting a branch can leave the URL
      // byte-identical to the one already on screen (no param before, none after),
      // which the router treats as no navigation at all — and the thing that
      // actually changed, the cookie, is only read during a server render. So ask
      // for one explicitly.
      router.refresh();
    },
    [pathname, router, search],
  );

  const value = useMemo<ActiveLocationValue>(
    () => ({
      active: choice.active,
      locationId: locationFilter(choice.active),
      locations,
      setActive,
    }),
    [choice.active, locations, setActive],
  );

  return <ActiveLocationContext.Provider value={value}>{children}</ActiveLocationContext.Provider>;
}

/**
 * The branch the console is currently scoped to, plus the setter the switcher
 * writes through. Outside the dashboard layout (tests, previews) this reports
 * "all locations" with an inert setter rather than throwing — the same posture
 * `useGymCurrency()` takes.
 */
export function useActiveLocation(): ActiveLocationValue {
  return useContext(ActiveLocationContext);
}
