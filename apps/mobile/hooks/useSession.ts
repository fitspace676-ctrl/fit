// @fit/mobile — the session, as React sees it.
//
// One `useSyncExternalStore` over the snapshot `lib/auth/session.ts` already
// maintains. Deliberately trivial: the store is the authority, the hook is a
// window onto it, and there is no second copy of session state living in a
// context or a reducer that could disagree with the one the HTTP client reads
// synchronously on every request.
//
// **No navigation here.** The old app's guard was a hook that called
// `router.replace` from an effect, which is why its zone table could only be
// exercised by mounting the app and was therefore never tested. Routing is the
// screen layer's job, driven by the pure `resolveRedirect` in
// `lib/route-policy.ts`.

import { useSyncExternalStore } from 'react';
import { getSessionState, subscribeSessionState, type SessionState } from '../lib/auth/session';

export type { SessionState } from '../lib/auth/session';

/**
 * The current session: `hydrating` until `hydrateAuth()` resolves, then
 * `signed-out` or `signed-in`.
 *
 * The third argument (server snapshot) is the same getter as the client's —
 * there is no server render in a native app, and passing it silences the
 * hydration-mismatch path rather than leaving `undefined` to throw if this hook
 * is ever pulled into a web build of the router.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSessionState, getSessionState, getSessionState);
}

/** Convenience: is someone signed in right now? `false` while hydrating. */
export function useIsSignedIn(): boolean {
  return useSession().status === 'signed-in';
}
