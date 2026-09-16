import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '../../lib/query-keys';
import {
  INVALIDATION_MATRIX,
  RESOURCE_ROOTS,
  invalidateFor,
  resourceRoot,
  type MutationName,
} from './invalidation';
import { MissingGymScopeError, requireGymId, type MutationDeps } from './deps';
import { bookClassMutationOptions, cancelBookingMutationOptions } from './useBookingMutations';
import {
  addCartItemMutationOptions,
  removeCartItemMutationOptions,
  updateCartItemMutationOptions,
} from './useCartMutations';
import { checkoutCartMutationOptions, createCheckoutMutationOptions } from './useCheckoutMutations';
import {
  enrollSubscriptionMutationOptions,
  freezeSubscriptionMutationOptions,
  unfreezeSubscriptionMutationOptions,
} from './useSubscriptionMutations';
import { purchaseCreditPackMutationOptions } from './useCreditPackMutations';
import {
  replaceMyGoalsMutationOptions,
  updateMyProfileMutationOptions,
} from './useAccountMutations';
import { createReviewMutationOptions } from './useReviewMutations';
import { bookServiceSessionMutationOptions } from './useServiceSessionMutations';
import {
  markNotificationsReadMutationOptions,
  registerPushTokenMutationOptions,
  unregisterPushTokenMutationOptions,
} from './useNotificationMutations';

const GYM = 'gym_a';

/** The callbacks the harness drives, with the generics erased. */
interface ErasedOptions {
  mutationFn?: (variables: unknown) => unknown;
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => unknown;
  onSettled?: (data: unknown, error: unknown, variables: unknown, context: unknown) => unknown;
}

/** A `QueryClient` that records instead of caching. */
function recorder(mutating = 1) {
  const invalidated: unknown[][] = [];
  const written = new Map<string, unknown>();
  const client = {
    invalidateQueries: (filters: { queryKey: readonly unknown[] }) => {
      invalidated.push([...filters.queryKey]);
      return Promise.resolve();
    },
    setQueryData: (key: readonly unknown[], value: unknown) => {
      written.set(JSON.stringify(key), value);
      return value;
    },
    getQueryData: (key: readonly unknown[]) => written.get(JSON.stringify(key)),
    cancelQueries: () => Promise.resolve(),
    isMutating: () => mutating,
  };
  return { client: client as unknown as QueryClient, invalidated, written };
}

function depsFor(client: QueryClient, gymId: string | null = GYM): MutationDeps {
  return { gymId, queryClient: client };
}

/** What the matrix says a mutation must invalidate, as concrete keys. */
function expectedKeys(name: MutationName): unknown[][] {
  return INVALIDATION_MATRIX[name].map((target) => [...RESOURCE_ROOTS[target](GYM)]);
}

interface Case {
  /** The matrix row this exercises. */
  readonly name: MutationName;
  readonly build: (deps: MutationDeps) => object;
  /** The value `onSuccess` receives — only the checkout cases care. */
  readonly result?: unknown;
  readonly variables?: unknown;
}

/**
 * Every mutation in the package, once per matrix row.
 *
 * `POST /cart/checkout` appears three times because its three outcomes are three
 * different rows: a completed order moves stock, a `PRICE_CHANGED` re-priced the
 * cart without selling anything, and an `OUT_OF_STOCK` removed lines *and*
 * revealed stock the listing has wrong.
 */
const CASES: readonly Case[] = [
  { name: 'bookClass', build: bookClassMutationOptions },
  { name: 'cancelBooking', build: cancelBookingMutationOptions },
  { name: 'enrollSubscription', build: enrollSubscriptionMutationOptions },
  { name: 'freezeSubscription', build: freezeSubscriptionMutationOptions },
  { name: 'unfreezeSubscription', build: unfreezeSubscriptionMutationOptions },
  { name: 'purchaseCreditPack', build: purchaseCreditPackMutationOptions },
  { name: 'createCheckout', build: createCheckoutMutationOptions },
  {
    name: 'addCartItem',
    build: addCartItemMutationOptions,
    result: { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' },
  },
  {
    name: 'updateCartItem',
    build: updateCartItemMutationOptions,
    result: { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' },
  },
  {
    name: 'removeCartItem',
    build: removeCartItemMutationOptions,
    result: { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' },
  },
  {
    name: 'checkoutCart',
    build: checkoutCartMutationOptions,
    result: { ok: true, orderId: 'ord_1' },
  },
  {
    name: 'checkoutCartPriceChanged',
    build: checkoutCartMutationOptions,
    result: { ok: false, reason: 'PRICE_CHANGED', newPrices: [] },
  },
  {
    name: 'checkoutCartOutOfStock',
    build: checkoutCartMutationOptions,
    result: { ok: false, reason: 'OUT_OF_STOCK', removedItems: [] },
  },
  {
    name: 'updateMyProfile',
    build: updateMyProfileMutationOptions,
    result: { profile: { userId: 'u_1', name: 'A', email: 'a@b.test', phone: null } },
  },
  { name: 'replaceMyGoals', build: replaceMyGoalsMutationOptions, result: { goals: [] } },
  { name: 'createReview', build: createReviewMutationOptions },
  { name: 'bookServiceSession', build: bookServiceSessionMutationOptions },
  { name: 'markNotificationsRead', build: markNotificationsReadMutationOptions },
  { name: 'registerPushToken', build: registerPushTokenMutationOptions },
  { name: 'unregisterPushToken', build: unregisterPushTokenMutationOptions },
];

/** Run a case's success path and return the keys it invalidated, in order. */
function invalidationsOf(testCase: Case): unknown[][] {
  const { client, invalidated } = recorder();
  const options = testCase.build(depsFor(client)) as ErasedOptions;
  options.onSuccess?.(testCase.result, testCase.variables, undefined);
  options.onSettled?.(testCase.result, null, testCase.variables, undefined);
  return invalidated;
}

describe('the invalidation matrix', () => {
  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s invalidates exactly its matrix row',
    (name, testCase) => {
      expect(invalidationsOf(testCase)).toEqual(expectedKeys(name));
    },
  );

  it('covers every row in the matrix — no mutation ships untested', () => {
    // The exhaustiveness check. Without it, adding a mutation and forgetting to
    // add a case here would leave the new row asserted by nothing.
    const covered = new Set(CASES.map((testCase) => testCase.name));
    const declared = Object.keys(INVALIDATION_MATRIX) as MutationName[];
    expect([...covered].sort()).toEqual([...declared].sort());
  });

  it('matches the reviewed matrix', () => {
    // One line per mutation. A change to what a mutation invalidates is a
    // reviewable diff, not something buried in a callback.
    const rendered = (Object.keys(INVALIDATION_MATRIX) as MutationName[])
      .map((name) => `${name}: ${INVALIDATION_MATRIX[name].join(', ') || '(nothing)'}`)
      .join('\n');
    expect(rendered).toMatchSnapshot();
  });
});

describe('the gaps this matrix exists to close', () => {
  it('booking and cancelling a class both invalidate credit packs', () => {
    // A confirmed seat is paid for with a class credit, and cancelling refunds
    // it — inside the same transaction that claims/releases the seat.
    for (const name of ['bookClass', 'cancelBooking'] as const) {
      expect(INVALIDATION_MATRIX[name]).toContain('creditPacks');
    }
  });

  it('freeze and unfreeze both invalidate classes and bookings', () => {
    // A FROZEN membership makes booking fail with 409, so every class card's
    // affordance changes — not just the membership tile.
    for (const name of ['freezeSubscription', 'unfreezeSubscription'] as const) {
      expect(INVALIDATION_MATRIX[name]).toContain('classes');
      expect(INVALIDATION_MATRIX[name]).toContain('bookings');
    }
  });

  it('POST /checkout invalidates membership, credit packs, both catalogues and bookings', () => {
    // The old app invalidated none of this; its screens called `.refetch()`.
    expect([...INVALIDATION_MATRIX.createCheckout].sort()).toEqual([
      'bookings',
      'catalogue',
      'creditPacks',
      'membership',
      'packCatalogue',
    ]);
  });

  it('cart checkout also invalidates products, because stock moved', () => {
    expect(INVALIDATION_MATRIX.checkoutCart).toContain('products');
    expect(INVALIDATION_MATRIX.checkoutCartOutOfStock).toContain('products');
    // A price change sells nothing, so no stock moved.
    expect(INVALIDATION_MATRIX.checkoutCartPriceChanged).not.toContain('products');
  });

  it('a completed cart checkout invalidates the ORDER HISTORY, and the two rejections do not', () => {
    // `201` is the only one of the three that creates an order. A price change
    // and an out-of-stock removal both leave the history exactly as it was, and
    // invalidating it there would refetch a list nothing had changed.
    expect(INVALIDATION_MATRIX.checkoutCart).toContain('myOrders');
    expect(INVALIDATION_MATRIX.checkoutCartPriceChanged).not.toContain('myOrders');
    expect(INVALIDATION_MATRIX.checkoutCartOutOfStock).not.toContain('myOrders');
  });

  it('booking a PT session invalidates the membership, because it raises an invoice', () => {
    // The member's invoice history is part of `GET /me/subscription`; there is
    // no separate invoices query.
    expect(INVALIDATION_MATRIX.bookServiceSession).toContain('membership');
  });
});

describe('RESOURCE_ROOTS', () => {
  it('puts gymId at index 1 of every root, so evictGym reaches it', () => {
    for (const [name, build] of Object.entries(RESOURCE_ROOTS)) {
      const key = build(GYM);
      expect(key[1], `${name} is gym-scoped`).toBe(GYM);
    }
  });

  it('slices filter-carrying factories back to their two-segment prefix', () => {
    // `queryKeys.notifications(gymId)` is `['notifications', gymId, null]` — one
    // filter bucket. Invalidating that would miss an `unreadOnly` list and the
    // badge at `['notifications', gymId, 'unreadCount']`.
    expect(queryKeys.notifications(GYM)).toEqual(['notifications', GYM, null]);
    expect(RESOURCE_ROOTS.notifications(GYM)).toEqual(['notifications', GYM]);
    expect(queryKeys.unreadCount(GYM).slice(0, 2)).toEqual(RESOURCE_ROOTS.notifications(GYM));

    // `catalogue()` carries the branch filter at [2], so the row has to slice
    // too — otherwise a purchase refreshes only the no-branch bucket and a
    // buyer who picked a branch keeps the catalogue they bought from.
    expect(queryKeys.catalogue(GYM)).toEqual(['catalogue', GYM, null]);
    expect(RESOURCE_ROOTS.catalogue(GYM)).toEqual(['catalogue', GYM]);
    expect(queryKeys.catalogue(GYM, 'loc_1').slice(0, 2)).toEqual(RESOURCE_ROOTS.catalogue(GYM));

    expect(RESOURCE_ROOTS.products(GYM)).toEqual(['products', GYM]);
    expect(RESOURCE_ROOTS.serviceSlots(GYM)).toEqual(['serviceSlots', GYM]);
    expect(RESOURCE_ROOTS.myServiceSessions(GYM)).toEqual(['myServiceSessions', GYM]);
  });

  it('leaves an already-rooted factory alone', () => {
    expect(RESOURCE_ROOTS.classes(GYM)).toEqual(queryKeys.classes(GYM));
    expect(RESOURCE_ROOTS.bookings(GYM)).toEqual(queryKeys.bookings(GYM));
    expect(RESOURCE_ROOTS.cart(GYM)).toEqual(queryKeys.cart(GYM));
  });

  it('resourceRoot keeps the resource and the gym and drops the rest', () => {
    expect(resourceRoot(queryKeys.classDetail(GYM, 'ci_1'))).toEqual(['classes', GYM]);
    expect(resourceRoot(queryKeys.trainerReviews(GYM, 't_1'))).toEqual(['trainers', GYM]);
  });
});

describe('invalidateFor', () => {
  it('invalidates in matrix order and nothing else', () => {
    const { client, invalidated } = recorder();
    invalidateFor(client, GYM, 'bookClass');
    expect(invalidated).toEqual([
      ['classes', GYM],
      ['bookings', GYM],
      ['creditPacks', GYM],
    ]);
  });

  it('does nothing for a mutation whose row is empty', () => {
    const { client, invalidated } = recorder();
    invalidateFor(client, GYM, 'registerPushToken');
    expect(invalidated).toEqual([]);
  });
});

describe('the gym-scope guard', () => {
  it.each(CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s refuses to run without a gym in scope',
    (_name, testCase) => {
      // A mutating control rendered while signed out is a routing bug. It should
      // be loud, not a silent no-op against an empty cache bucket.
      const { client } = recorder();
      const options = testCase.build(depsFor(client, null)) as ErasedOptions;
      expect(() => options.mutationFn?.(testCase.variables)).toThrow(MissingGymScopeError);
    },
  );

  it('requireGymId names the action in its message', () => {
    expect(() => requireGymId(null, 'Booking a class')).toThrow(/Booking a class requires/);
    expect(requireGymId(GYM, 'Booking a class')).toBe(GYM);
  });
});
