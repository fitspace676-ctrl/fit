import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  NON_GYM_SCOPED_KEYS,
  evictGym,
  isGymScoped,
  queryKeys,
  type QueryKeyName,
} from './query-keys';

const GYM = '__GYM__';

/**
 * Every factory, invoked with sentinel arguments.
 *
 * Written out longhand rather than reflected over: the point of the snapshot is
 * that a human reviews the *shape* of every key in a diff, and a loop that
 * generates arguments would happily generate them for a factory whose signature
 * someone quietly changed.
 */
const ALL_KEYS: Record<QueryKeyName, readonly unknown[]> = {
  classes: queryKeys.classes(GYM),
  classList: queryKeys.classList(GYM, { from: '2026-08-30' }),
  classDetail: queryKeys.classDetail(GYM, 'class_1'),
  bookings: queryKeys.bookings(GYM),
  bookingList: queryKeys.bookingList(GYM, { scope: 'upcoming' }),
  cart: queryKeys.cart(GYM),
  catalogue: queryKeys.catalogue(GYM, 'location_1'),
  products: queryKeys.products(GYM, { category: 'apparel' }),
  packages: queryKeys.packages(GYM, 'location_1'),
  checkoutOrder: queryKeys.checkoutOrder(GYM, 'order_1'),
  myOrders: queryKeys.myOrders(GYM, { limit: 20 }),
  locations: queryKeys.locations(GYM),
  banners: queryKeys.banners(GYM),
  trainers: queryKeys.trainers(GYM),
  trainer: queryKeys.trainer(GYM, 'trainer_1'),
  trainerReviews: queryKeys.trainerReviews(GYM, 'trainer_1', { page: 2 }),
  membership: queryKeys.membership(GYM),
  creditPacks: queryKeys.creditPacks(GYM),
  packCatalogue: queryKeys.packCatalogue(GYM),
  profile: queryKeys.profile(GYM),
  goals: queryKeys.goals(GYM),
  serviceSlots: queryKeys.serviceSlots(GYM, 'service_1', { date: '2026-08-30' }),
  myServiceSessions: queryKeys.myServiceSessions(GYM, { scope: 'upcoming' }),
  notifications: queryKeys.notifications(GYM, { unreadOnly: true }),
  unreadCount: queryKeys.unreadCount(GYM),
  gymBySlug: queryKeys.gymBySlug('demo-gym'),
};

describe('queryKeys', () => {
  it('covers every exported factory — a new key must be added here', () => {
    expect(Object.keys(ALL_KEYS).sort()).toEqual(Object.keys(queryKeys).sort());
  });

  it('puts gymId at index 1 of every gym-scoped key', () => {
    // THE invariant. Switching gym means re-login (D4), so a cache entry minted
    // under gym A that is still readable under gym B is one tenant's data
    // rendered inside another tenant's session. A fixed position makes that
    // unrepresentable and makes per-gym eviction a one-liner.
    for (const [name, key] of Object.entries(ALL_KEYS) as [QueryKeyName, unknown[]][]) {
      if (!isGymScoped(name)) {
        continue;
      }
      expect(key[1], `${name} must carry gymId at index 1`).toBe(GYM);
    }
  });

  it('names the non-gym-scoped keys explicitly, so an omission is deliberate', () => {
    expect(NON_GYM_SCOPED_KEYS).toEqual(['gymBySlug']);
    // gymBySlug runs before a session exists, so there is no gym to scope it by.
    expect(queryKeys.gymBySlug('demo-gym')).toEqual(['gymBySlug', 'demo-gym']);
  });

  it('matches the recorded key shapes', () => {
    // A snapshot in literal form rather than an external `.snap` file: it is
    // reviewable in the diff that changes it, which is the whole point.
    expect(ALL_KEYS).toEqual({
      classes: ['classes', GYM],
      classList: ['classes', GYM, 'list', { from: '2026-08-30' }],
      classDetail: ['classes', GYM, 'detail', 'class_1'],
      bookings: ['bookings', GYM],
      bookingList: ['bookings', GYM, 'list', { scope: 'upcoming' }],
      cart: ['cart', GYM],
      catalogue: ['catalogue', GYM, 'location_1'],
      products: ['products', GYM, { category: 'apparel' }],
      packages: ['packages', GYM, 'location_1'],
      checkoutOrder: ['checkoutOrder', GYM, 'order_1'],
      myOrders: ['myOrders', GYM, { limit: 20 }],
      locations: ['locations', GYM],
      banners: ['banners', GYM],
      trainers: ['trainers', GYM],
      trainer: ['trainers', GYM, 'detail', 'trainer_1'],
      trainerReviews: ['trainers', GYM, 'detail', 'trainer_1', 'reviews', { page: 2 }],
      membership: ['membership', GYM],
      creditPacks: ['creditPacks', GYM],
      packCatalogue: ['packCatalogue', GYM],
      profile: ['profile', GYM],
      goals: ['goals', GYM],
      serviceSlots: ['serviceSlots', GYM, 'service_1', { date: '2026-08-30' }],
      myServiceSessions: ['myServiceSessions', GYM, { scope: 'upcoming' }],
      notifications: ['notifications', GYM, { unreadOnly: true }],
      unreadCount: ['notifications', GYM, 'unreadCount'],
      gymBySlug: ['gymBySlug', 'demo-gym'],
    });
  });

  it('nests details under their resource root so one invalidation covers both', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.classList(GYM), ['a']);
    client.setQueryData(queryKeys.classDetail(GYM, 'class_1'), { id: 'class_1' });

    const matched = client
      .getQueryCache()
      .findAll({ queryKey: queryKeys.classes(GYM) })
      .map((query) => query.queryKey);

    expect(matched).toHaveLength(2);
  });

  it('nests the unread badge under the inbox so the two cannot disagree', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.notifications(GYM), []);
    client.setQueryData(queryKeys.unreadCount(GYM), 3);
    expect(client.getQueryCache().findAll({ queryKey: ['notifications', GYM] })).toHaveLength(2);
  });

  it('gives each branch its own catalogue bucket, still reachable by prefix', () => {
    // The bug this pins: `GET /catalogue?locationId=` narrows the package list,
    // so one key for two requests meant switching branch served the previous
    // branch's catalogue out of the cache and never refetched.
    expect(queryKeys.catalogue(GYM, 'loc_a')).not.toEqual(queryKeys.catalogue(GYM, 'loc_b'));
    // No branch is its own bucket too, not a synonym for one of them.
    expect(queryKeys.catalogue(GYM)).toEqual(['catalogue', GYM, null]);

    const client = new QueryClient();
    client.setQueryData(queryKeys.catalogue(GYM), { plans: [] });
    client.setQueryData(queryKeys.catalogue(GYM, 'loc_a'), { plans: [] });
    client.setQueryData(queryKeys.catalogue(GYM, 'loc_b'), { plans: [] });

    // The two-segment root — what `RESOURCE_ROOTS.catalogue` slices to — still
    // reaches every one of them, so the `createCheckout` matrix row is intact.
    expect(client.getQueryCache().findAll({ queryKey: ['catalogue', GYM] })).toHaveLength(3);
  });

  it('gives each branch its own packages bucket', () => {
    expect(queryKeys.packages(GYM, 'loc_a')).not.toEqual(queryKeys.packages(GYM, 'loc_b'));
    const client = new QueryClient();
    client.setQueryData(queryKeys.packages(GYM, 'loc_a'), { packages: [] });
    client.setQueryData(queryKeys.packages(GYM, 'loc_b'), { packages: [] });
    expect(client.getQueryCache().findAll({ queryKey: ['packages', GYM] })).toHaveLength(2);
  });

  it('keeps the order HISTORY apart from the confirmation of one order', () => {
    // Two routes, two roots. `GET /me/orders` pages summaries; `GET /checkout/
    // :orderId` reads one placed order back, and an order is immutable once
    // placed — so invalidating the history must not drop every confirmation
    // screen's cache with it.
    const client = new QueryClient();
    client.setQueryData(queryKeys.myOrders(GYM), { orders: [] });
    client.setQueryData(queryKeys.checkoutOrder(GYM, 'ord_1'), { order: { id: 'ord_1' } });

    expect(client.getQueryCache().findAll({ queryKey: ['myOrders', GYM] })).toHaveLength(1);
    expect(client.getQueryData(queryKeys.checkoutOrder(GYM, 'ord_1'))).toBeDefined();
  });

  it('nests trainer reviews under the trainer so a new review refreshes the rating', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.trainer(GYM, 't1'), { rating: 4.5 });
    client.setQueryData(queryKeys.trainerReviews(GYM, 't1'), []);
    expect(client.getQueryCache().findAll({ queryKey: queryKeys.trainer(GYM, 't1') })).toHaveLength(
      2,
    );
  });
});

describe('evictGym', () => {
  it('drops one gym’s entries and leaves the others standing', () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.membership('gym_a'), { status: 'ACTIVE' });
    client.setQueryData(queryKeys.classList('gym_a'), ['a']);
    client.setQueryData(queryKeys.membership('gym_b'), { status: 'FROZEN' });
    client.setQueryData(queryKeys.gymBySlug('demo'), { id: 'gym_a' });

    evictGym(client, 'gym_a');

    expect(client.getQueryData(queryKeys.membership('gym_a'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.classList('gym_a'))).toBeUndefined();
    expect(client.getQueryData(queryKeys.membership('gym_b'))).toEqual({ status: 'FROZEN' });
    // Not gym-scoped and carries nothing member-specific — it survives.
    expect(client.getQueryData(queryKeys.gymBySlug('demo'))).toEqual({ id: 'gym_a' });
  });
});
