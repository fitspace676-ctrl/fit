// @fit/mobile — the "first run is done" flag.
//
// Same shape as `token-store`: persisted value + in-memory snapshot + subscriber
// set, so the route guard observes "onboarding finished" the instant the user
// taps Get started rather than on the next relaunch. Sharing the shape matters
// more than it looks — the guard reads both stores through one
// `useSyncExternalStore` idiom, and a second, differently-shaped store is how
// "two ways to read app state" starts.
//
// This is not a secret, but it keeps the salvaged app's SecureStore key
// (`onboarding_done`) so an upgrade over an existing install does not replay the
// three onboarding slides at someone who has already seen them.

import { getSecureStorage } from './token-store';

const ONBOARDING_DONE_KEY = 'onboarding_done';

let complete = false;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) {
    notify();
  }
}

/** Subscribe to onboarding-flag changes. Returns an unsubscribe. */
export function subscribeOnboarding(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Whether onboarding has been completed, read synchronously from memory.
 *
 * `false` until {@link hydrateOnboarding} resolves. The app must therefore hold
 * the splash screen until hydration finishes, or a returning user sees a frame
 * of onboarding before being redirected away from it.
 */
export function getOnboardingSnapshot(): boolean {
  return complete;
}

/** Load the persisted flag into memory once at startup. */
export async function hydrateOnboarding(): Promise<boolean> {
  complete = (await getSecureStorage().getItem(ONBOARDING_DONE_KEY)) === 'true';
  emit();
  return complete;
}

/**
 * Mark onboarding complete and publish it. Once set it is never unset, so the
 * slides are shown exactly once per install.
 */
export async function setOnboardingComplete(): Promise<void> {
  await getSecureStorage().setItem(ONBOARDING_DONE_KEY, 'true');
  complete = true;
  emit();
}

/**
 * Reset the flag. Exists for the developer menu and for specs — sign-out does
 * **not** call it: onboarding explains the app, not the account, so replaying it
 * after a logout would be an insult to a returning user.
 */
export async function resetOnboarding(): Promise<void> {
  await getSecureStorage().deleteItem(ONBOARDING_DONE_KEY);
  complete = false;
  emit();
}
