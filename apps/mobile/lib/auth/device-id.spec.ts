import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceIdSnapshot, hydrateDeviceId, resetDeviceIdCache } from './device-id';
import { setSecureStorage, type SecureStorageAdapter } from './token-store';

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

describe('device-id', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    setSecureStorage(storage);
    resetDeviceIdCache();
  });

  afterEach(() => {
    resetDeviceIdCache();
    setSecureStorage(null);
  });

  it('mints and persists an id on first run', async () => {
    const id = await hydrateDeviceId(() => 'minted-id');
    expect(id).toBe('minted-id');
    expect(storage.map.get('device_id')).toBe('minted-id');
    expect(getDeviceIdSnapshot()).toBe('minted-id');
  });

  it('reuses the persisted id across launches', async () => {
    // POST /notifications/push-token upserts on (userId, deviceId) — a new id
    // per launch would pile up a dead row and a stale Expo token every time,
    // and sign-out could never unregister the device it was actually on.
    setSecureStorage(fakeStorage({ device_id: 'existing-id' }));
    const mint = vi.fn(() => 'should-not-be-used');
    await expect(hydrateDeviceId(mint)).resolves.toBe('existing-id');
    expect(mint).not.toHaveBeenCalled();
  });

  it('is idempotent within a launch and touches storage once', async () => {
    await hydrateDeviceId(() => 'minted-id');
    const getItem = vi.spyOn(storage, 'getItem');
    await expect(hydrateDeviceId(() => 'other')).resolves.toBe('minted-id');
    expect(getItem).not.toHaveBeenCalled();
  });

  it('mints a v4-shaped uuid by default', async () => {
    const id = await hydrateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('ignores an empty stored value and mints afresh', async () => {
    setSecureStorage(fakeStorage({ device_id: '' }));
    await expect(hydrateDeviceId(() => 'minted-id')).resolves.toBe('minted-id');
  });
});
