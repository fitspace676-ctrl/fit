import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../query-client';
import type { SecureStorageAdapter } from './token-store';
import * as tokenStore from './token-store';

const {
  endSession,
  getAccessToken,
  getGymId,
  getSessionClaims,
  getSessionSnapshot,
  getSecureStorage,
  hydrateSession,
  saveTokens,
  setSecureStorage,
  subscribeSession,
} = tokenStore;

/** An in-memory stand-in for the Keychain / Keystore. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const adapter: SecureStorageAdapter & { map: Map<string, string> } = {
    map,
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
  return adapter;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function accessTokenFor(gymId: string, sub = 'user_1'): string {
  return `h.${base64url(JSON.stringify({ sub, gymId, role: 'MEMBER', exp: 4_000_000_000 }))}.s`;
}

const SESSION = { accessToken: accessTokenFor('gym_a'), refreshToken: 'refresh-1' };

describe('token-store', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    setSecureStorage(storage);
    queryClient.clear();
  });

  afterEach(async () => {
    // Restore a working backend first: a case may have swapped in a failing one
    // (or none at all), and the teardown must still be able to end the session.
    setSecureStorage(storage);
    await endSession();
    setSecureStorage(null);
  });

  it('keeps clearTokens private — endSession is the only way out', () => {
    // Defect #3: clearing the keychain without clearing the cache leaves every
    // gym-scoped entry alive for the next member who signs in.
    expect(Object.keys(tokenStore)).not.toContain('clearTokens');
  });

  it('throws a useful error when no storage backend is installed', () => {
    setSecureStorage(null);
    expect(() => getSecureStorage()).toThrow(/Secure storage is not installed/);
  });

  it('saves a pair, publishes it synchronously, and decodes its claims once', async () => {
    const notify = vi.fn();
    const unsubscribe = subscribeSession(notify);

    await saveTokens(SESSION);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(getSessionSnapshot()).toEqual(SESSION);
    expect(getAccessToken()).toBe(SESSION.accessToken);
    expect(getSessionClaims()?.sub).toBe('user_1');
    // The login response is a bare TokenPair — the JWT is the only source of gymId.
    expect(getGymId()).toBe('gym_a');
    expect(storage.map.get('access_token')).toBe(SESSION.accessToken);
    expect(storage.map.get('refresh_token')).toBe('refresh-1');

    unsubscribe();
    await saveTokens({ ...SESSION, refreshToken: 'refresh-2' });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('hydrates a persisted session at launch', async () => {
    setSecureStorage(
      fakeStorage({ access_token: SESSION.accessToken, refresh_token: SESSION.refreshToken }),
    );
    await expect(hydrateSession()).resolves.toEqual(SESSION);
    expect(getGymId()).toBe('gym_a');
  });

  it('treats half a persisted pair as no session', async () => {
    // A torn write would otherwise leave the app sending a stale access token
    // it has no refresh token to renew.
    setSecureStorage(fakeStorage({ access_token: SESSION.accessToken }));
    await expect(hydrateSession()).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('reads the token from memory, never from storage, on the request path', async () => {
    await saveTokens(SESSION);
    const getItem = vi.spyOn(storage, 'getItem');
    for (let i = 0; i < 8; i += 1) {
      getAccessToken();
    }
    expect(getItem).not.toHaveBeenCalled();
  });

  it('endSession wipes the keychain AND the query cache', async () => {
    await saveTokens(SESSION);
    queryClient.setQueryData(['membership', 'gym_a'], { status: 'ACTIVE' });
    queryClient.setQueryData(['gymBySlug', 'demo'], { id: 'gym_a' });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);

    await endSession();

    expect(getSessionSnapshot()).toBeNull();
    expect(getSessionClaims()).toBeNull();
    expect(getGymId()).toBeNull();
    expect(storage.map.size).toBe(0);
    // Not just the gym-scoped ones: on sign-out even the unscoped entries were
    // fetched under someone's session.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('clears the cache even when the keychain write fails', async () => {
    await saveTokens(SESSION);
    queryClient.setQueryData(['membership', 'gym_a'], { status: 'ACTIVE' });
    setSecureStorage({
      ...storage,
      deleteItem: () => Promise.reject(new Error('keychain locked')),
    });

    await expect(endSession()).rejects.toThrow('keychain locked');

    // Leaving one member's data on screen is worse than a failed keychain wipe.
    expect(getSessionSnapshot()).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    setSecureStorage(storage);
  });

  it('re-decodes claims on every save, so a rotated token retargets the gym', async () => {
    await saveTokens(SESSION);
    expect(getGymId()).toBe('gym_a');
    await saveTokens({ accessToken: accessTokenFor('gym_b'), refreshToken: 'r2' });
    expect(getGymId()).toBe('gym_b');
  });

  it('holds a null claim set for a token it cannot decode', async () => {
    await saveTokens({ accessToken: 'garbage', refreshToken: 'r' });
    expect(getSessionSnapshot()?.accessToken).toBe('garbage');
    expect(getSessionClaims()).toBeNull();
    expect(getGymId()).toBeNull();
  });
});
