// @fit/admin — resolving the operator's permissions, once per request.
//
// Server-only: this reads the session cookie and calls the API. A Client
// Component gets the same answer from `components/console-permissions.tsx`,
// which the dashboard layout seeds with what this returns — the same split
// `lib/active-location-server.ts` makes against `lib/active-location.ts`, and for
// the same reason (`next/headers` cannot appear in a `'use client'` module's
// import graph, even transitively).
//
// ONCE. Memoised with React's `cache()`, so the layout, the branch resolver and
// any page that asks all share one round trip per render pass. Without it, wiring
// the gate into the layout and the location filter into ~25 pages would add a
// request per caller — and, worse, would let two of them resolve differently if
// the settings changed mid-render.
//
// FAIL CLOSED, WITH ONE EXCEPTION THAT IS NOT ONE. Every failure — no session, a
// refusal, an unparseable body, a network error — resolves to `DENIED_ACCESS`,
// which holds no capability and reaches no branch. The exception is that
// `SUPER_ADMIN` and `OWNER` are answered without any I/O at all: both are system
// roles pinned by the storage contract to every permission over every branch, so
// there is nothing to look up. That is also what keeps an owner able to reach the
// console (and the permissions editor) when the API is unreachable — the one
// person who would have to fix it is the one person who cannot be locked out.

import { cache } from 'react';
import { consolePermissionsFrom, fullConsoleAccess, DENIED_ACCESS } from './console-permissions';
import type { ConsolePermissions } from './console-permissions';
import { fetchMyPermissions } from './api';
import { getServerSession } from './session';

/**
 * What the signed-in operator may do at the active gym.
 *
 * Never throws and never returns `null`: a caller gating on this must not have a
 * "could not tell" branch to get wrong, so every unknown is
 * {@link DENIED_ACCESS}.
 */
export const getConsolePermissions = cache(async (): Promise<ConsolePermissions> => {
  const session = await getServerSession();
  if (!session) {
    return DENIED_ACCESS;
  }

  // The system roles, answered from the contract rather than from the network.
  if (session.role === 'SUPER_ADMIN' || session.role === 'OWNER') {
    return fullConsoleAccess(session.role);
  }

  try {
    return consolePermissionsFrom(await fetchMyPermissions());
  } catch {
    // A refusal, a 404 from an API that predates the endpoint, or an unreachable
    // one. All three mean the same thing: we do not know what this person may do,
    // so they may do nothing. Falling back to the shipped matrix here would
    // silently restore every capability a gym had revoked, which is the one
    // outcome this feature exists to prevent.
    return DENIED_ACCESS;
  }
});
