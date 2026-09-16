// @fit/mobile — a stable per-install device identifier.
//
// Consumed by push registration: `POST /notifications/push-token` upserts on
// `(userId, deviceId)` and `DELETE /notifications/push-token/:deviceId`
// unregisters — so an id that changes between launches would pile up a dead row
// per launch and fan every notification out to a growing set of stale Expo
// tokens, while sign-out could never unregister the device it was actually on.
//
// What it is NOT: a fingerprint, an ad id, or anything the API authenticates.
// `apps/api` plumbs no device identity through HTTP at all — the refresh token's
// `deviceFingerprint` column is set server-side and never read from a header —
// so this is a random opaque value the app mints for itself, scoped to the
// install and destroyed with it. Nothing about the hardware is read.

import { getSecureStorage } from './token-store';

const DEVICE_ID_KEY = 'device_id';

let deviceId: string | null = null;

/**
 * Mint a random v4-shaped UUID.
 *
 * `crypto.randomUUID` is used when the runtime has it (Hermes on recent RN, and
 * Node under Vitest); the fallback is `Math.random`, which is *not* cryptographic
 * — acceptable only because this value is a cache key, never a credential. If it
 * ever becomes one, this must move to `expo-crypto`'s `getRandomBytesAsync`.
 */
function randomUuid(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * The device id, read synchronously from memory. `null` until
 * {@link hydrateDeviceId} has run — callers on the push path must await that
 * first rather than registering under a null id.
 */
export function getDeviceIdSnapshot(): string | null {
  return deviceId;
}

/**
 * Load the persisted device id, minting and storing one on first run. Idempotent:
 * a second call returns the same id without touching storage.
 */
export async function hydrateDeviceId(mint: () => string = randomUuid): Promise<string> {
  if (deviceId !== null) {
    return deviceId;
  }
  const store = getSecureStorage();
  const existing = await store.getItem(DEVICE_ID_KEY);
  if (existing !== null && existing.length > 0) {
    deviceId = existing;
    return existing;
  }
  const minted = mint();
  await store.setItem(DEVICE_ID_KEY, minted);
  deviceId = minted;
  return minted;
}

/** Drop the in-memory id (specs and the developer menu). The stored id survives. */
export function resetDeviceIdCache(): void {
  deviceId = null;
}
