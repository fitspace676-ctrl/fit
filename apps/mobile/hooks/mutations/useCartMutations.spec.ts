import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { CartView } from '@fit/types';
import { queryKeys } from '../../lib/query-keys';
import {
  CART_MUTATION_KEY,
  addCartItemMutationOptions,
  removeCartItemMutationOptions,
  updateCartItemMutationOptions,
  withLineQuantity,
  withoutLine,
} from './useCartMutations';
import type { MutationDeps } from './deps';

const GYM = 'gym_a';
const KEY = JSON.stringify(queryKeys.cart(GYM));

function line(variantId: string, unitPrice: number, qty: number): CartView['items'][number] {
  return {
    variantId,
    productId: variantId.split(':')[0] as string,
    productName: variantId,
    variantName: null,
    imageUrl: null,
    unitPrice,
    qty,
    lineTotal: unitPrice * qty,
    currency: 'GEL',
    available: true,
  };
}

const CART: CartView = {
  items: [line('p_1:0', 1500, 2), line('p_2:0', 500, 1)],
  subtotal: 3500,
  discount: 0,
  total: 3500,
  currency: 'GEL',
};

/** A recording `QueryClient` with a real (tiny) data store. */
function recorder(mutating = 1) {
  const invalidated: unknown[][] = [];
  const store = new Map<string, unknown>();
  const client = {
    invalidateQueries: (filters: { queryKey: readonly unknown[] }) => {
      invalidated.push([...filters.queryKey]);
      return Promise.resolve();
    },
    setQueryData: (key: readonly unknown[], value: unknown) => {
      store.set(JSON.stringify(key), value);
      return value;
    },
    getQueryData: (key: readonly unknown[]) => store.get(JSON.stringify(key)),
    cancelQueries: () => Promise.resolve(),
    isMutating: () => mutating,
  };
  return {
    deps: { gymId: GYM, queryClient: client as unknown as QueryClient } satisfies MutationDeps,
    invalidated,
    store,
  };
}

interface ErasedOptimistic {
  onMutate?: (variables: unknown) => Promise<unknown>;
  onError?: (error: unknown, variables: unknown, context: unknown) => unknown;
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => unknown;
  onSettled?: (data: unknown, error: unknown, variables: unknown, context: unknown) => unknown;
}

describe('the optimistic arithmetic', () => {
  it('sets a line quantity and reprices the cart', () => {
    const next = withLineQuantity(CART, 'p_1:0', 4);
    expect(next.items[0]).toMatchObject({ qty: 4, lineTotal: 6000 });
    expect(next.subtotal).toBe(6500);
    expect(next.total).toBe(6500);
    // The untouched line is untouched.
    expect(next.items[1]).toEqual(CART.items[1]);
  });

  it('honours a discount when repricing, and never goes negative', () => {
    const discounted: CartView = { ...CART, discount: 10_000, total: 0 };
    expect(withLineQuantity(discounted, 'p_1:0', 1).total).toBe(0);
  });

  it('removes a line and reprices', () => {
    const next = withoutLine(CART, 'p_1:0');
    expect(next.items).toHaveLength(1);
    expect(next.subtotal).toBe(500);
  });

  it('leaves the cart alone for an unknown variant rather than inventing a line', () => {
    // The caller can only reach this from a rendered line, so an absent one
    // means the cache moved underneath the tap — the server's answer is the only
    // correct one.
    expect(withLineQuantity(CART, 'nope', 9)).toEqual(CART);
    expect(withoutLine(CART, 'nope')).toEqual(CART);
  });

  it('does not mutate the input cart', () => {
    const before = JSON.stringify(CART);
    withLineQuantity(CART, 'p_1:0', 7);
    withoutLine(CART, 'p_1:0');
    expect(JSON.stringify(CART)).toBe(before);
  });
});

describe('the optimistic quantity update', () => {
  it('writes the guess before the request and the server cart after it', async () => {
    const { deps, store } = recorder();
    store.set(KEY, CART);
    const options = updateCartItemMutationOptions(deps) as unknown as ErasedOptimistic;

    const context = await options.onMutate?.({ variantId: 'p_1:0', qty: 5 });
    expect((store.get(KEY) as CartView).items[0]).toMatchObject({ qty: 5, lineTotal: 7500 });

    const server: CartView = { ...CART, subtotal: 9999, total: 9999 };
    options.onSuccess?.(server, { variantId: 'p_1:0', qty: 5 }, context);
    expect(store.get(KEY)).toBe(server);
  });

  it('rolls back to the pre-tap cart when the request fails', async () => {
    const { deps, store } = recorder();
    store.set(KEY, CART);
    const options = updateCartItemMutationOptions(deps) as unknown as ErasedOptimistic;

    const context = await options.onMutate?.({ variantId: 'p_1:0', qty: 5 });
    options.onError?.(new Error('offline'), { variantId: 'p_1:0', qty: 5 }, context);

    expect(store.get(KEY)).toEqual(CART);
  });

  it('is a no-op when nothing is cached yet, rather than fabricating a cart', async () => {
    const { deps, store } = recorder();
    const options = updateCartItemMutationOptions(deps) as unknown as ErasedOptimistic;

    await options.onMutate?.({ variantId: 'p_1:0', qty: 5 });

    expect(store.has(KEY)).toBe(false);
  });
});

describe('the optimistic removal', () => {
  it('drops the line immediately and restores it on failure', async () => {
    const { deps, store } = recorder();
    store.set(KEY, CART);
    const options = removeCartItemMutationOptions(deps) as unknown as ErasedOptimistic;

    const context = await options.onMutate?.({ variantId: 'p_1:0' });
    expect((store.get(KEY) as CartView).items).toHaveLength(1);

    options.onError?.(new Error('offline'), { variantId: 'p_1:0' }, context);
    expect(store.get(KEY)).toEqual(CART);
  });
});

describe('add-to-cart is deliberately not optimistic', () => {
  it('declares no onMutate — the client cannot know unitPrice, available, or the merge', () => {
    // Fabricating a line means rendering a price and a subtotal that are
    // guesses, for the 200ms before the real cart replaces them. A wrong number
    // that corrects itself is worse than a spinner: the buyer read it.
    const { deps } = recorder();
    const options = addCartItemMutationOptions(deps) as unknown as ErasedOptimistic;
    expect(options.onMutate).toBeUndefined();
  });
});

describe('the settle-time convergence pass', () => {
  it('invalidates the cart once this is the last cart mutation in flight', () => {
    const { deps, invalidated } = recorder(1);
    const options = updateCartItemMutationOptions(deps) as unknown as ErasedOptimistic;

    options.onSettled?.(CART, null, { variantId: 'p_1:0', qty: 2 }, undefined);

    expect(invalidated).toEqual([[...queryKeys.cart(GYM)]]);
  });

  it('does not invalidate while other cart taps are still in flight', () => {
    // Five stepper taps must converge on one refetch, not queue five that four
    // of them are about to make stale again.
    const { deps, invalidated } = recorder(3);
    const options = updateCartItemMutationOptions(deps) as unknown as ErasedOptimistic;

    options.onSettled?.(CART, null, { variantId: 'p_1:0', qty: 2 }, undefined);

    expect(invalidated).toEqual([]);
  });

  it('gives all three writes the same mutationKey prefix, so they can count each other', () => {
    const { deps } = recorder();
    for (const build of [
      addCartItemMutationOptions,
      updateCartItemMutationOptions,
      removeCartItemMutationOptions,
    ]) {
      const key = (build(deps) as { mutationKey?: readonly unknown[] }).mutationKey ?? [];
      expect(key.slice(0, CART_MUTATION_KEY.length)).toEqual([...CART_MUTATION_KEY]);
    }
  });
});
