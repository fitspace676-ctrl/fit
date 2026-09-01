'use client';

// @fit/admin — the operator's effective permissions, available to every client
// component.
//
// Exactly the `GymCurrencyProvider` shape (`components/gym-currency.tsx`), for
// exactly the same reason: one server-resolved value, seeded into context, so the
// first client render already has the real answer and nothing flashes a
// placeholder. Here the placeholder would have been worse than a wrong currency —
// the sidebar used to render from `useSession()`, which resolves over a `fetch`
// after mount, so the rail spent a beat as a skeleton on every load and any
// component gating on a capability had to carry an `isLoading` branch.
//
// It also fixes a correctness problem, not just a flash. `usePermissions()` read
// the static `ROLE_PERMISSIONS` matrix, so a gym that had revoked a capability
// still got buttons for it — the console offering what the server would refuse.
// The value below is what the gym itself grants, resolved once per request in
// `app/(dashboard)/layout.tsx`.
//
// THE DEFAULT IS DENIAL. A component rendered outside the console layout (a test,
// a preview) sees `DENIED_ACCESS` and shows nothing gated, rather than seeing the
// permissive answer a missing provider would otherwise invite. That is the
// opposite of `useGymCurrency`'s posture, deliberately: falling back to the
// platform's default currency is a cosmetic guess, and falling back to "allowed"
// is not.

import { createContext, useContext, type ReactNode } from 'react';
import { DENIED_ACCESS, type ConsolePermissions } from '@/lib/console-permissions';

const ConsolePermissionsContext = createContext<ConsolePermissions>(DENIED_ACCESS);

/**
 * Seed the operator's resolved permissions for the console. `permissions` comes
 * from the server (`getConsolePermissions()`), so the first client render already
 * knows what may be shown.
 */
export function ConsolePermissionsProvider({
  permissions,
  children,
}: {
  permissions: ConsolePermissions;
  children: ReactNode;
}) {
  return (
    <ConsolePermissionsContext.Provider value={permissions}>
      {children}
    </ConsolePermissionsContext.Provider>
  );
}

/**
 * What the signed-in operator may do at this gym. Denies everything outside the
 * dashboard layout — see the note at the top of this file.
 */
export function useConsolePermissions(): ConsolePermissions {
  return useContext(ConsolePermissionsContext);
}
