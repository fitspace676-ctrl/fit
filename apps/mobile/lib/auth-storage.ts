// @fit/mobile — durable, secure session storage (Keychain / Keystore).
//
// The access + refresh tokens are the app's only secrets, so they live in
// `expo-secure-store` (iOS Keychain, Android Keystore) — NEVER in AsyncStorage,
// and never written to a log line. This module is the single source of truth for
// "the current session": alongside the SecureStore persistence it keeps an
// in-memory snapshot with a tiny pub/sub so React (via `useAuth`) and the API
// client observe sign-in / sign-out the moment it happens, without re-reading
// the keychain on every render.
//
// The biometric-unlock *preference* is intentionally NOT a secret — it is a
// plain boolean kept in AsyncStorage; the secret it guards stays in SecureStore.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/** A signed session: short-lived access JWT + opaque rotating refresh token. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// SecureStore keys. Underscored (Keychain/Keystore account names) — no token
// value is ever part of a key, and key names carry no secret.
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Non-sensitive: whether the user opted into biometric unlock. AsyncStorage is
// the right home for it precisely because it is not a secret.
const BIOMETRIC_PREF_KEY = 'fit.biometricUnlockEnabled';

// Whether the first-run onboarding has been completed. The T6.2 contract pins
// this to SecureStore under the `onboarding_done` key, so the "show onboarding
// once" gate sits next to the session it precedes. The value is a plain `"true"`
// flag rather than a secret; we follow the contract's chosen store regardless.
const ONBOARDING_DONE_KEY = 'onboarding_done';

// In-memory mirror of the persisted session + subscribers. `cachedSession` is
// the value `getSessionSnapshot` returns; its reference only changes on
// save / clear / hydrate, which is what keeps `useSyncExternalStore` stable.
let cachedSession: TokenPair | null = null;
const subscribers = new Set<() => void>();

// In-memory mirror of the onboarding flag with its own pub/sub, so the route
// guard observes "onboarding finished" the moment the user taps Get started —
// the exact pattern `cachedSession` uses for sign-in / sign-out.
let onboardingComplete = false;
const onboardingSubscribers = new Set<() => void>();

function emitOnboarding(): void {
  for (const notify of onboardingSubscribers) notify();
}

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Subscribe to session changes (save / clear / hydrate). Returns an unsubscribe. */
export function subscribeSession(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/** The last-known session without touching the keychain (null until hydrated). */
export function getSessionSnapshot(): TokenPair | null {
  return cachedSession;
}

/**
 * Load the persisted session from SecureStore into the in-memory snapshot once
 * at startup, so a relaunch restores the signed-in state without a login prompt.
 * Returns the hydrated session (or null when signed out).
 */
export async function hydrateSession(): Promise<TokenPair | null> {
  cachedSession = await getTokens();
  emit();
  return cachedSession;
}

/**
 * Persist a session to the keychain and update the in-memory snapshot. Called by
 * every sign-in path (OAuth, password reset) and by the API client's silent
 * refresh, so a rotated token pair is stored exactly where the next launch reads.
 */
export async function saveTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
  cachedSession = tokens;
  emit();
}

/**
 * Read the persisted token pair, or null when either half is absent (signed
 * out). Reads straight from SecureStore — use {@link getSessionSnapshot} on the
 * render path to avoid an async keychain hit.
 */
export async function getTokens(): Promise<TokenPair | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

/** Wipe the persisted session from the keychain and the in-memory snapshot. */
export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
  cachedSession = null;
  emit();
}

/** True when the user has enabled biometric (Face ID / Touch ID) unlock. */
export async function isBiometricUnlockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIOMETRIC_PREF_KEY)) === 'true';
}

/** Record the user's biometric-unlock preference (non-sensitive, AsyncStorage). */
export async function setBiometricUnlockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_PREF_KEY, enabled ? 'true' : 'false');
}

/** Subscribe to onboarding-flag changes (complete / hydrate). Returns an unsubscribe. */
export function subscribeOnboarding(callback: () => void): () => void {
  onboardingSubscribers.add(callback);
  return () => {
    onboardingSubscribers.delete(callback);
  };
}

/** The last-known onboarding flag without touching SecureStore (false until hydrated). */
export function getOnboardingSnapshot(): boolean {
  return onboardingComplete;
}

/**
 * Load the persisted onboarding flag into the in-memory snapshot once at
 * startup, so a relaunch knows whether to bypass the onboarding screens.
 */
export async function hydrateOnboarding(): Promise<boolean> {
  onboardingComplete = (await SecureStore.getItemAsync(ONBOARDING_DONE_KEY)) === 'true';
  emitOnboarding();
  return onboardingComplete;
}

/** Read the persisted onboarding flag straight from SecureStore. */
export async function isOnboardingComplete(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ONBOARDING_DONE_KEY)) === 'true';
}

/**
 * Mark first-run onboarding complete: persist the flag and flip the in-memory
 * snapshot so the route guard moves the user on without a relaunch. Once set it
 * is never unset, so the onboarding screens are shown exactly once.
 */
export async function setOnboardingComplete(): Promise<void> {
  await SecureStore.setItemAsync(ONBOARDING_DONE_KEY, 'true');
  onboardingComplete = true;
  emitOnboarding();
}

/** True when the device has biometric hardware AND the user has enrolled a face/fingerprint. */
export async function isBiometricAvailable(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hasHardware && isEnrolled;
}

/**
 * Prompt for biometric authentication to unlock a stored session. Returns true
 * when the user successfully authenticates. Callers should gate this on
 * {@link isBiometricUnlockEnabled} + {@link isBiometricAvailable}; the authed
 * app shell (a later task) decides when to invoke it on resume / launch.
 */
export async function authenticateWithBiometrics(
  promptMessage = 'Unlock FormaCore',
): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    // Let the OS fall back to the device passcode if biometrics fail.
    disableDeviceFallback: false,
  });
  return result.success;
}
