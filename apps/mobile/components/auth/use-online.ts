// @fit/mobile — "can a request succeed right now?", for the auth screens.
//
// The source of truth is TanStack Query's `onlineManager`, which
// `wireQueryBridges` already binds to NetInfo at startup (including the
// captive-portal case: `isInternetReachable` beats `isConnected` on a gym's
// guest Wi-Fi). Reading it here rather than subscribing to NetInfo a second time
// means the banner and the query layer can never disagree about whether the app
// is offline — two independent subscriptions with slightly different
// interpretations of the same event is how a screen ends up showing "you're
// offline" over content that just loaded.
//
// The auth screens are the one place this genuinely changes behaviour: they are
// all mutations, `onlineManager` does not pause a raw `fetch` the way it pauses
// a query, and a POST fired into a dead radio fails after the 15s timeout with
// a generic error the user reads as "the app is broken".

import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  return onlineManager.subscribe(callback);
}

function snapshot(): boolean {
  return onlineManager.isOnline();
}

/**
 * Whether requests can be expected to succeed. `true` until NetInfo says
 * otherwise — assuming offline before the bridge has answered would block the
 * first sign-in of every cold start behind a manager that has not flipped yet.
 */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
