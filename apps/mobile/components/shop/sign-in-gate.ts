// @fit/mobile — D9: the shop browses signed out, but the cart does not.
//
// ===========================================================================
// WHY THIS IS NOT THE SAME AS THE JOIN FUNNEL BEING PUBLIC.
//
// §1 of the plan lists "a signed-out purchase impossible" among the deleted
// app's defects, and `(join)/**` is public for exactly that reason. Two
// different purchases were being conflated (plan §7, D9):
//
//   * The JOIN FUNNEL buys a *membership*: signup precedes the charge, so the
//     buyer is authenticated by the time money moves. Public, and it stays
//     public.
//   * The RETAIL CART buys a shaker. `CartController` is `@Public()`, but a
//     *guest* cart is identified by the `fit_cart_sid` cookie — and RN has no
//     cookie jar, so D3 sends `credentials: 'omit'`. On this platform the cart
//     is Bearer-scoped ONLY. A signed-out `POST /cart/items` would land in a
//     cart nobody can ever read back.
//
// So add-to-cart prompts sign-in and returns via `?next=`. The copy for the
// prompt already exists — `member.cart.signInToAdd` — which is itself evidence
// the decision was anticipated by whoever wrote the catalogues.
// ===========================================================================
//
// `hydrating` is NOT `signed-out`. The keychain read is async, and treating the
// pre-hydration frame as signed out would bounce a returning member to `/login`
// for pressing "+" a beat too early. {@link SignInGate.ready} is what a screen
// disables its CTA on for that one frame.

import { useToast } from '@fit/ui-mobile';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useSession } from '../../hooks/useSession';
import { LOGIN_ROUTE } from '../../lib/route-policy';
import { useI18n } from '../../providers/I18nProvider';

/** What {@link useSignInGate} hands back. */
export interface SignInGate {
  /** A session exists — the cart write may go ahead. */
  signedIn: boolean;
  /** The session is known either way. `false` only during hydration. */
  ready: boolean;
  /**
   * Announce why nothing happened and send the member to sign in, returning to
   * `next` afterwards. A no-op while hydrating.
   *
   * Returns `true` when it took the press — so a call site reads
   * `if (gate.prompt(here)) return;` and cannot forget the early return.
   */
  prompt: (next: string) => boolean;
}

/**
 * The sign-in gate for a cart write.
 *
 * @example
 * const gate = useSignInGate();
 * if (gate.prompt('/shop')) return;
 * addItem.mutate({ variantId, qty: 1 });
 */
export function useSignInGate(): SignInGate {
  const session = useSession();
  const router = useRouter();
  const toast = useToast();
  const { t } = useI18n();

  const signedIn = session.status === 'signed-in';
  const ready = session.status !== 'hydrating';

  const prompt = useCallback(
    (next: string): boolean => {
      if (session.status === 'signed-in') return false;
      // Nothing is known yet. Swallow the press rather than routing on a guess:
      // one frame later the member may already be signed in.
      if (session.status === 'hydrating') return true;
      toast.info(t('member.cart.signInToAdd'));
      router.push(`${LOGIN_ROUTE}?next=${encodeURIComponent(next)}`);
      return true;
    },
    [router, session.status, t, toast],
  );

  return { signedIn, ready, prompt };
}
