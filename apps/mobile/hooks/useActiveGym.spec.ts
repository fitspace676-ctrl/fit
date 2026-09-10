// Same shape as `useSession.spec.ts`: React's `useSyncExternalStore` is stubbed
// to the getter it would call on a render, so the hook's contract is testable
// without a renderer (§5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useSyncExternalStore: <T>(
    _subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => T,
  ): T => getSnapshot(),
}));

const { queryClient } = await import('../lib/query-client');
const { setSecureStorage, saveTokens, endSession } = await import('../lib/auth/token-store');
const { hydrateAuth, resetSessionForTests } = await import('../lib/auth/session');
const { useActiveGym, useGymId } = await import('./useActiveGym');

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => Promise.resolve(map.get(key) ?? null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key: string) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function tokenFor(claims: Record<string, unknown>): string {
  return `h.${base64url(JSON.stringify(claims))}.s`;
}

const IN_GYM_A = tokenFor({ sub: 'user_1', gymId: 'gym_a', role: 'MEMBER', exp: 4_000_000_000 });
const IN_GYM_B = tokenFor({ sub: 'user_2', gymId: 'gym_b', role: 'MEMBER', exp: 4_000_000_000 });
/** A platform account with no active membership: the API omits `gymId` entirely. */
const NO_MEMBERSHIP = tokenFor({ sub: 'user_3', role: 'MEMBER', exp: 4_000_000_000 });

beforeEach(() => {
  setSecureStorage(fakeStorage());
  resetSessionForTests();
  queryClient.clear();
});

afterEach(async () => {
  await endSession();
  resetSessionForTests();
});

describe('useActiveGym', () => {
  it('is null while hydrating and while signed out', async () => {
    expect(useActiveGym()).toBeNull();
    await hydrateAuth();
    expect(useActiveGym()).toBeNull();
    expect(useGymId()).toBeNull();
  });

  it('derives gymId, role and userId from the access token claims', async () => {
    await hydrateAuth();
    await saveTokens({ accessToken: IN_GYM_A, refreshToken: 'r1' });
    expect(useActiveGym()).toEqual({ gymId: 'gym_a', role: 'MEMBER', userId: 'user_1' });
    expect(useGymId()).toBe('gym_a');
  });

  it('follows the session across a re-login into a different gym', async () => {
    // Switching gym *is* re-login (D4) — there is no tenant-switch endpoint — so
    // this is the only way the scope changes, and every gym-scoped query key
    // must move with it.
    await hydrateAuth();
    await saveTokens({ accessToken: IN_GYM_A, refreshToken: 'r1' });
    await endSession();
    await saveTokens({ accessToken: IN_GYM_B, refreshToken: 'r2' });
    expect(useGymId()).toBe('gym_b');
  });

  it('is null for a signed-in user with no active membership', async () => {
    // Not an error state: the user can browse and join. Screens branch on this
    // and render their own "no plan" CTA; the route guard ignores it entirely.
    await hydrateAuth();
    await saveTokens({ accessToken: NO_MEMBERSHIP, refreshToken: 'r1' });
    expect(useActiveGym()).toBeNull();
    expect(useGymId()).toBeNull();
  });

  it('returns a stable reference between session changes', async () => {
    await hydrateAuth();
    await saveTokens({ accessToken: IN_GYM_A, refreshToken: 'r1' });
    expect(useActiveGym()).toBe(useActiveGym());
  });
});
