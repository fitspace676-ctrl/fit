// @fit/mobile — the app's auth hook: reactive session + login / logout.
//
// Reads the session from the SecureStore-backed snapshot in `auth-storage` via
// `useSyncExternalStore`, so every consumer re-renders the instant a sign-in,
// refresh, or sign-out changes it. On first mount it hydrates the snapshot from
// the keychain exactly once (shared across all consumers) — that hydration is
// what lets a cold launch restore the signed-in state without a login prompt.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { API_URL } from '../lib/api-client';
import {
  clearTokens,
  getSessionSnapshot,
  getTokens,
  hydrateSession,
  saveTokens,
  subscribeSession,
  type TokenPair,
} from '../lib/auth-storage';

// AsyncStorage key under which the push-registration task (later phase) records
// the device id its Expo push token was registered under, so logout can
// unregister it. Absent today → the unregister step is a graceful no-op.
const PUSH_DEVICE_ID_KEY = 'fit.pushTokenDeviceId';

// Shared one-shot hydration: the keychain is read once per app launch no matter
// how many components mount `useAuth`.
let hydration: Promise<unknown> | null = null;
function ensureHydrated(): Promise<unknown> {
  if (!hydration) hydration = hydrateSession();
  return hydration;
}

export interface UseAuth {
  /** The current session, or null when signed out. */
  session: TokenPair | null;
  /** True while the initial keychain hydration is in flight. */
  isLoading: boolean;
  /** Persist a freshly-issued token pair and mark the user signed in. */
  login: (tokens: TokenPair) => Promise<void>;
  /** Sign out: revoke server-side, unregister push, then clear the keychain. */
  logout: () => Promise<void>;
}

/**
 * Drive auth from any screen. `session` is reactive; gate protected UI on it
 * once `isLoading` is false. `login` is called with the {@link TokenPair} a
 * sign-in flow returns; `logout` tears the session down everywhere.
 */
export function useAuth(): UseAuth {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getSessionSnapshot);
  const [isLoading, setIsLoading] = useState(hydration === null);

  useEffect(() => {
    let active = true;
    void ensureHydrated().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return {
    session,
    isLoading,
    login: saveTokens,
    logout,
  };
}

/**
 * Sign out. Best-effort revokes the refresh-token family server-side and
 * unregisters the Expo push token, then always clears the local keychain — local
 * sign-out must succeed even when the device is offline, so neither network step
 * is allowed to block or throw.
 */
async function logout(): Promise<void> {
  const current = await getTokens();
  await Promise.allSettled([revokeServerSession(current), unregisterPushToken(current)]);
  await clearTokens();
}

/** Revoke the refresh token's family via `POST /auth/logout` (best-effort). */
async function revokeServerSession(session: TokenPair | null): Promise<void> {
  if (!session) return;
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  }).catch(() => undefined);
}

/**
 * Unregister this device's Expo push token via
 * `DELETE /notifications/push-token/:deviceId` (best-effort). No-op until the
 * push-registration task stores a device id under {@link PUSH_DEVICE_ID_KEY}.
 */
async function unregisterPushToken(session: TokenPair | null): Promise<void> {
  if (!session) return;
  const deviceId = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY).catch(() => null);
  if (!deviceId) return;
  await fetch(`${API_URL}/notifications/push-token/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.accessToken}` },
  }).catch(() => undefined);
}
