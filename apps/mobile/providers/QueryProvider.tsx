import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Builds the app-wide TanStack Query client. One instance lives per app process
 * so the cache is shared across every tab and screen: a query fired from the
 * Classes tab is deduplicated and reused when the same key is requested from
 * Bookings or Shop. Defaults are tuned for a member app on cellular:
 *
 *   • `retry: 2`        — survive a flaky connection without hammering the API
 *   • `staleTime: 30s`  — data is fresh for 30s, so tab switches skip refetch
 *   • `gcTime: 5min`    — keep unused cache 5min so revisiting a tab is instant
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        staleTime: 30_000,
        gcTime: 300_000,
        // React Native has no window-focus concept; refetch is driven by
        // explicit invalidation / mount instead.
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Wraps the tree in a single, app-lifetime {@link QueryClient}. */
export function QueryProvider({ children }: { children: ReactNode }) {
  // Lazy initialiser keeps the same client across re-renders and Fast Refresh.
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
