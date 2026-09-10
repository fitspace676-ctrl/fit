import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../lib/env';
import {
  endSession,
  saveTokens,
  setSecureStorage,
  type SecureStorageAdapter,
} from '../../lib/auth/token-store';
import { resetApiClientForTests } from '../../lib/http/api-client';
import { NON_GYM_SCOPED_KEYS } from '../../lib/query-keys';
import { classQueryOptions, classesQueryOptions } from './useClasses';
import { myBookingsQueryOptions } from './useBookings';
import { cartQueryOptions } from './useCart';
import {
  catalogueQueryOptions,
  locationsQueryOptions,
  packagesQueryOptions,
  productsQueryOptions,
} from './useShop';
import {
  creditPacksQueryOptions,
  membershipQueryOptions,
  packCatalogueQueryOptions,
} from './useMembership';
import { myGoalsQueryOptions, myProfileQueryOptions } from './useAccount';
import {
  trainerQueryOptions,
  trainerReviewsQueryOptions,
  trainersQueryOptions,
} from './useTrainers';
import {
  myServiceSessionsQueryOptions,
  serviceSlotsQueryOptions,
  servicesQueryOptions,
} from './useServices';
import { notificationsQueryOptions, unreadCountQueryOptions } from './useNotifications';
import { checkoutOrderQueryOptions } from './useCheckoutOrder';
import { gymBySlugQueryOptions } from './useGym';

const GYM = 'gym_a';
const WINDOW = { from: '2026-09-01T00:00:00.000Z', to: '2026-09-08T00:00:00.000Z' };

/** The shape a `useQuery` options object exposes to this harness. */
interface ErasedQueryOptions {
  queryKey: readonly unknown[];
  queryFn?: (context: { signal?: AbortSignal }) => Promise<unknown>;
  enabled?: boolean;
}

interface Case {
  readonly name: string;
  readonly build: (gymId: string | null) => object;
  /** The path + query the `queryFn` must request. */
  readonly url: string;
  /** `false` for the one key that is intentionally not gym-scoped. */
  readonly gymScoped?: boolean;
}

const CASES: readonly Case[] = [
  {
    name: 'classes',
    build: (gymId) => classesQueryOptions(gymId, WINDOW),
    url: `/class-instances?gymId=${GYM}&from=${encodeURIComponent(WINDOW.from)}&to=${encodeURIComponent(WINDOW.to)}`,
  },
  {
    name: 'class detail',
    build: (gymId) => classQueryOptions(gymId, 'ci_1'),
    url: `/class-instances/ci_1?gymId=${GYM}`,
  },
  {
    name: 'my bookings',
    build: (gymId) => myBookingsQueryOptions(gymId, 'upcoming'),
    url: '/me/bookings?scope=upcoming',
  },
  { name: 'cart', build: (gymId) => cartQueryOptions(gymId, 'GEL'), url: '/cart' },
  { name: 'products', build: productsQueryOptions, url: `/products?gymId=${GYM}` },
  {
    name: 'packages',
    build: (gymId) => packagesQueryOptions(gymId),
    url: `/packages?gymId=${GYM}`,
  },
  { name: 'locations', build: locationsQueryOptions, url: `/locations?gymId=${GYM}` },
  {
    name: 'catalogue',
    build: (gymId) => catalogueQueryOptions(gymId),
    url: `/catalogue?gymId=${GYM}`,
  },
  {
    name: 'catalogue for one branch',
    build: (gymId) => catalogueQueryOptions(gymId, 'loc_1'),
    url: `/catalogue?gymId=${GYM}&locationId=loc_1`,
  },
  {
    name: 'packages for one branch',
    build: (gymId) => packagesQueryOptions(gymId, 'loc_1'),
    url: `/packages?gymId=${GYM}&locationId=loc_1`,
  },
  { name: 'membership', build: membershipQueryOptions, url: '/me/subscription' },
  { name: 'credit packs', build: creditPacksQueryOptions, url: '/members/me/credit-packs' },
  { name: 'pack catalogue', build: packCatalogueQueryOptions, url: '/credit-packs/catalogue' },
  { name: 'profile', build: myProfileQueryOptions, url: '/me/profile' },
  { name: 'goals', build: myGoalsQueryOptions, url: '/me/goals' },
  { name: 'trainers', build: trainersQueryOptions, url: `/trainers?gymId=${GYM}` },
  {
    name: 'trainer detail',
    build: (gymId) => trainerQueryOptions(gymId, 't_1'),
    url: `/trainers/t_1?gymId=${GYM}`,
  },
  {
    name: 'trainer reviews',
    build: (gymId) => trainerReviewsQueryOptions(gymId, 't_1'),
    url: `/trainers/t_1/reviews?gymId=${GYM}`,
  },
  { name: 'services', build: servicesQueryOptions, url: `/services?gymId=${GYM}` },
  {
    name: 'service slots',
    build: (gymId) => serviceSlotsQueryOptions(gymId, WINDOW),
    url: `/service-sessions?gymId=${GYM}&from=${encodeURIComponent(WINDOW.from)}&to=${encodeURIComponent(WINDOW.to)}`,
  },
  {
    name: 'my service sessions',
    build: myServiceSessionsQueryOptions,
    url: '/me/service-sessions',
  },
  {
    name: 'notifications',
    build: (gymId) => notificationsQueryOptions(gymId),
    url: '/notifications',
  },
  { name: 'unread count', build: unreadCountQueryOptions, url: '/notifications/unread-count' },
  {
    name: 'checkout order',
    build: (gymId) => checkoutOrderQueryOptions(gymId, 'ord_1'),
    url: '/checkout/ord_1',
  },
  {
    name: 'gym by slug',
    build: () => gymBySlugQueryOptions('downtown'),
    url: '/gyms/by-subdomain/downtown',
    gymScoped: false,
  },
];

function fakeStorage(): SecureStorageAdapter {
  const map = new Map<string, string>();
  return {
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
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

const ACCESS = `h.${base64url(
  JSON.stringify({ sub: 'u_1', gymId: GYM, role: 'MEMBER', exp: 4_000_000_000 }),
)}.s`;

function stubFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return urls;
}

beforeEach(async () => {
  setSecureStorage(fakeStorage());
  resetApiClientForTests();
  // A session, so the cart query actually issues its request rather than
  // short-circuiting to an empty cart.
  await saveTokens({ accessToken: ACCESS, refreshToken: 'r1' });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setSecureStorage(fakeStorage());
  await endSession();
  setSecureStorage(null);
});

describe('every query hook is gym-scoped and gated', () => {
  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s puts gymId at index 1 of its key',
    (_name, testCase) => {
      if (testCase.gymScoped === false) {
        // The one exception, and it is on the factory's allowlist.
        expect(NON_GYM_SCOPED_KEYS).toContain('gymBySlug');
        return;
      }
      const options = testCase.build(GYM) as ErasedQueryOptions;
      expect(options.queryKey[1]).toBe(GYM);
    },
  );

  it.each(CASES.filter((c) => c.gymScoped !== false).map((c) => [c.name, c] as const))(
    '%s is disabled while there is no gym',
    (_name, testCase) => {
      // The placeholder key is only safe because nothing is ever fetched into
      // it. Losing the guard turns it into a bucket two tenants could share.
      expect((testCase.build(null) as ErasedQueryOptions).enabled).toBe(false);
      expect((testCase.build(GYM) as ErasedQueryOptions).enabled).toBe(true);
    },
  );

  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s requests the endpoint its name promises',
    async (_name, testCase) => {
      const urls = stubFetch();
      const options = testCase.build(GYM) as ErasedQueryOptions;

      await options.queryFn?.({ signal: undefined });

      expect(urls).toEqual([`${env.apiUrl}${testCase.url}`]);
    },
  );
});

describe('queries that need a route param', () => {
  it.each([
    { name: 'class detail', build: () => classQueryOptions(GYM, undefined) },
    { name: 'trainer detail', build: () => trainerQueryOptions(GYM, undefined) },
    { name: 'trainer reviews', build: () => trainerReviewsQueryOptions(GYM, undefined) },
    { name: 'checkout order', build: () => checkoutOrderQueryOptions(GYM, undefined) },
    { name: 'gym by slug', build: () => gymBySlugQueryOptions(undefined) },
  ])('$name stays disabled until the param resolves', ({ build }) => {
    // A deep link resolves its param asynchronously; that is a disabled query,
    // not a request for `/class-instances/`.
    expect((build() as ErasedQueryOptions).enabled).toBe(false);
  });
});

describe('a branch filter that is on the wire is in the key', () => {
  // The bug: `GET /catalogue?locationId=` narrows the package list, but the key
  // did not carry the branch — so switching branch handed back the previous
  // branch's catalogue from the cache and never refetched.
  it.each([
    { name: 'catalogue', build: catalogueQueryOptions },
    { name: 'packages', build: packagesQueryOptions },
  ])('$name keys two branches apart', ({ build }) => {
    const a = (build(GYM, 'loc_a') as ErasedQueryOptions).queryKey;
    const b = (build(GYM, 'loc_b') as ErasedQueryOptions).queryKey;
    const none = (build(GYM) as ErasedQueryOptions).queryKey;

    expect(a).not.toEqual(b);
    expect(a).not.toEqual(none);
    // …and all three still share the two-segment root invalidation uses.
    for (const key of [a, b, none]) {
      expect(key.slice(0, 2)).toEqual(none.slice(0, 2));
    }
  });
});

describe('the shop reads that back the checkout screen', () => {
  it('reads an order back through /checkout/:orderId, never /orders/:id', async () => {
    const urls = stubFetch();
    const options = checkoutOrderQueryOptions(GYM, 'ord_1') as ErasedQueryOptions;

    await options.queryFn?.({ signal: undefined });

    expect(urls[0]).toBe(`${env.apiUrl}/checkout/ord_1`);
    expect(urls[0]).not.toContain('/orders/');
  });
});
