// @fit/mobile — the cart's three writes.
//
// ## Where optimism is earned, and where it is a lie
//
// **Quantity ± and line removal: yes.** Both are pure arithmetic on data the
// client already holds — the line exists, its `unitPrice` is known, and the new
// `lineTotal` is a multiplication. The stepper is the most-tapped control in the
// shop and a 200ms round trip per tap feels broken. If the server disagrees the
// `onSuccess` cart overwrites the guess a moment later, and the guess was never
// wrong about *money*.
//
// **Add-to-cart: no.** The client does not know the server's `unitPrice` (the
// cart re-prices live from the product), does not know `available`, and — the
// decisive one — does not know whether the variant merges into an existing line
// or opens a new one. Fabricating a line means rendering a price and a subtotal
// that are guesses, for the 200ms before the real cart replaces them. A wrong
// number that corrects itself is worse than a spinner: the buyer read it.
//
// **Checkout: never.** It is in `useCheckoutMutations.ts`, and it takes money.
//
// ## Why `setQueryData` and not `invalidateQueries`
//
// Every `/cart/*` mutation answers with the **whole, authoritative, freshly
// re-priced cart**. Invalidating would throw that away and pay for a second
// round trip to learn what the first one already said. So `onSuccess` writes the
// response into the cache directly.
//
// The settle-time `invalidateQueries` that follows is not a contradiction: it is
// the convergence pass. Rapid stepper taps overlap, responses can land out of
// order, and the last one to *return* is not necessarily the last one *sent*. So
// when the final cart mutation settles — and only then, hence the
// `isMutating() <= 1` guard — one refetch establishes the truth.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { AddCartItemInput, CartView } from '@fit/types';
import { addCartItem, removeCartItem, updateCartItem } from '../../lib/api/cart';
import { queryKeys } from '../../lib/query-keys';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/**
 * The shared `mutationKey` prefix of all three cart writes.
 *
 * Its only job is to make `isMutating({ mutationKey: CART_MUTATION_KEY })`
 * answerable: the settle-time invalidation must know whether *another cart tap*
 * is still in flight, not whether anything at all is.
 */
export const CART_MUTATION_KEY = ['cart'] as const;

/** What an optimistic cart mutation stashes so `onError` can put it back. */
interface CartRollback {
  readonly previous: CartView | undefined;
}

/** Recompute a cart's money from its lines. `discount` is applied at checkout, never here. */
function reprice(cart: CartView, items: CartView['items']): CartView {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  return { ...cart, items, subtotal, total: Math.max(0, subtotal - cart.discount) };
}

/**
 * The cart as it will look with one line set to `qty`. Pure.
 *
 * A `variantId` that is not in the cart returns the cart unchanged rather than
 * inventing a line — the caller can only reach this from a rendered line, so an
 * absent one means the cache moved underneath the tap and the server's answer is
 * the only correct one.
 */
export function withLineQuantity(cart: CartView, variantId: string, qty: number): CartView {
  return reprice(
    cart,
    cart.items.map((item) =>
      item.variantId === variantId ? { ...item, qty, lineTotal: item.unitPrice * qty } : item,
    ),
  );
}

/** The cart as it will look with one line gone. Pure, and idempotent. */
export function withoutLine(cart: CartView, variantId: string): CartView {
  return reprice(
    cart,
    cart.items.filter((item) => item.variantId !== variantId),
  );
}

/**
 * Invalidate the cart once the last cart mutation has settled.
 *
 * `isMutating` counts the mutation currently settling, so `<= 1` means "I am the
 * last one". Without the guard, five stepper taps queue five refetches of a
 * resource four of them are about to make stale again.
 */
function settleCart(
  deps: MutationDeps,
  gymId: string,
  mutation: 'addCartItem' | 'updateCartItem' | 'removeCartItem',
): void {
  if (deps.queryClient.isMutating({ mutationKey: CART_MUTATION_KEY }) <= 1) {
    invalidateFor(deps.queryClient, gymId, mutation);
  }
}

/**
 * `POST /cart/items`. **Not** optimistic — see this file's header.
 */
export function addCartItemMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CartView, Error, AddCartItemInput> {
  return {
    mutationKey: [...CART_MUTATION_KEY, 'add'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Adding to the cart');
      return addCartItem(input);
    },
    onSuccess: (cart) => {
      const gymId = requireGymId(deps.gymId, 'Adding to the cart');
      deps.queryClient.setQueryData(queryKeys.cart(gymId), cart);
    },
    onSettled: () => {
      settleCart(deps, requireGymId(deps.gymId, 'Adding to the cart'), 'addCartItem');
    },
  };
}

/** Add a variant to the cart (or bump the line it merges into). */
export function useAddCartItem() {
  return useMutation(addCartItemMutationOptions(useMutationDeps()));
}

/** `PATCH /cart/items/:variantId` — optimistic. */
export function updateCartItemMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CartView, Error, { variantId: string; qty: number }, CartRollback> {
  return {
    mutationKey: [...CART_MUTATION_KEY, 'update'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Changing a cart quantity');
      return updateCartItem(input);
    },
    onMutate: async (input) => {
      const gymId = requireGymId(deps.gymId, 'Changing a cart quantity');
      const key = queryKeys.cart(gymId);
      // An in-flight `GET /cart` would land *after* the optimistic write and
      // overwrite it with the pre-tap cart — the stepper would visibly bounce
      // back before settling. Cancel it; `onSettled` refetches anyway.
      await deps.queryClient.cancelQueries({ queryKey: key });
      const previous = deps.queryClient.getQueryData<CartView>(key);
      if (previous) {
        deps.queryClient.setQueryData(key, withLineQuantity(previous, input.variantId, input.qty));
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      const gymId = requireGymId(deps.gymId, 'Changing a cart quantity');
      if (context?.previous) {
        deps.queryClient.setQueryData(queryKeys.cart(gymId), context.previous);
      }
    },
    onSuccess: (cart) => {
      const gymId = requireGymId(deps.gymId, 'Changing a cart quantity');
      deps.queryClient.setQueryData(queryKeys.cart(gymId), cart);
    },
    onSettled: () => {
      settleCart(deps, requireGymId(deps.gymId, 'Changing a cart quantity'), 'updateCartItem');
    },
  };
}

/**
 * Set a line's absolute quantity.
 *
 * Absolute, not a delta: two taps racing each other converge on the number the
 * later one names instead of double-counting. Removing a line is
 * {@link useRemoveCartItem}, never `qty: 0` (the schema's minimum is 1).
 */
export function useUpdateCartItem() {
  return useMutation(updateCartItemMutationOptions(useMutationDeps()));
}

/** `DELETE /cart/items/:variantId` — optimistic. */
export function removeCartItemMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CartView, Error, { variantId: string }, CartRollback> {
  return {
    mutationKey: [...CART_MUTATION_KEY, 'remove'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Removing a cart line');
      return removeCartItem(input);
    },
    onMutate: async (input) => {
      const gymId = requireGymId(deps.gymId, 'Removing a cart line');
      const key = queryKeys.cart(gymId);
      await deps.queryClient.cancelQueries({ queryKey: key });
      const previous = deps.queryClient.getQueryData<CartView>(key);
      if (previous) {
        deps.queryClient.setQueryData(key, withoutLine(previous, input.variantId));
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      const gymId = requireGymId(deps.gymId, 'Removing a cart line');
      if (context?.previous) {
        deps.queryClient.setQueryData(queryKeys.cart(gymId), context.previous);
      }
    },
    onSuccess: (cart) => {
      const gymId = requireGymId(deps.gymId, 'Removing a cart line');
      deps.queryClient.setQueryData(queryKeys.cart(gymId), cart);
    },
    onSettled: () => {
      settleCart(deps, requireGymId(deps.gymId, 'Removing a cart line'), 'removeCartItem');
    },
  };
}

/** Remove a line. Idempotent server-side, so a double tap is harmless. */
export function useRemoveCartItem() {
  return useMutation(removeCartItemMutationOptions(useMutationDeps()));
}
