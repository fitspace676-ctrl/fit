// @fit/mobile — **the invalidation matrix**. The deliverable of WP-7.
//
// Every mutation in this app declares, as data, the exact set of cached
// resources its success makes stale. No screen may call `.refetch()`; the old
// app did, ad hoc, from ~a dozen call sites, and the set drifted from what the
// server actually changed until three whole classes of bug were live at once:
//
//   1. **Booking did not invalidate credit packs.** A confirmed seat is paid for
//      with a class credit inside the same transaction that claims it
//      (`apps/api/src/classes/bookings.service.ts` — `chargeSeatCredit` /
//      `refundCredit`), so booking three classes left the profile still showing
//      the opening balance.
//   2. **Freeze / unfreeze did not invalidate classes or bookings.** A `FROZEN`
//      membership cannot book, so the schedule went on offering a button that
//      answered 409.
//   3. **`POST /checkout` invalidated nothing at all.** The screens papered over
//      it with `.refetch()` calls, which is how the drift became invisible.
//
// Stating the set as a table makes it testable: `invalidation.spec.ts` drives
// every mutation's `onSuccess`/`onSettled` against a recording cache and asserts
// the calls *equal* the row below. Adding a mutation without a row does not
// compile; changing a row shows up in a snapshot diff.
//
// ## Roots, and why some are sliced
//
// TanStack Query invalidates by key **prefix**, so invalidating a resource's
// root reaches every list, filter bucket and detail beneath it. Most factories
// in `lib/query-keys.ts` have such a root (`queryKeys.classes(gymId)` →
// `['classes', gymId]`).
//
// Some do not: `queryKeys.notifications(gymId)` takes `filters` at index 2 and
// defaults it to `null`, so calling it yields `['notifications', gymId, null]` —
// *one* filter bucket. Invalidating that would leave `{unreadOnly: true}` lists
// and the `['notifications', gymId, 'unreadCount']` badge untouched, which is the
// classic "badge says 3, inbox is empty" bug the key factory's own doc comment
// promises against. {@link resourceRoot} recovers the two-segment prefix from
// whatever the factory returns, so the root is still *derived from* the factory
// rather than hand-written next to it.

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys, type QueryKey } from '../../lib/query-keys';

/**
 * The `[resource, gymId]` prefix of a key.
 *
 * Safe for every factory because index 0 is the resource and index 1 is the gym
 * — that ordering is the invariant `query-keys.spec.ts` enforces, so this
 * function cannot silently start returning the wrong prefix without that spec
 * failing first.
 */
export function resourceRoot(key: QueryKey): QueryKey {
  return key.slice(0, 2);
}

/**
 * Every cache root a mutation may invalidate, keyed by the name the matrix uses.
 *
 * All are gym-scoped, so all take the gym id. There is intentionally no entry
 * for `gymBySlug`: it is the one non-scoped key, it holds only the public tenant
 * record, and nothing a member does changes it.
 */
export const RESOURCE_ROOTS = {
  /** Schedule: the listing and every occurrence detail. */
  classes: (gymId: string): QueryKey => queryKeys.classes(gymId),
  /** The member's bookings, every scope. */
  bookings: (gymId: string): QueryKey => queryKeys.bookings(gymId),
  /** The server-side cart. */
  cart: (gymId: string): QueryKey => queryKeys.cart(gymId),
  /**
   * The join funnel's aggregate catalogue — sliced: `catalogue()` takes the
   * branch filter at [2], and a purchase changes what every branch sells.
   */
  catalogue: (gymId: string): QueryKey => resourceRoot(queryKeys.catalogue(gymId)),
  /** The retail product listing — sliced: `products()` takes filters at [2]. */
  products: (gymId: string): QueryKey => resourceRoot(queryKeys.products(gymId)),
  /** The current membership *and* its invoice history (one endpoint, one key). */
  membership: (gymId: string): QueryKey => queryKeys.membership(gymId),
  /** The member's owned credit packs and balances. */
  creditPacks: (gymId: string): QueryKey => queryKeys.creditPacks(gymId),
  /** The credit packs on sale. */
  packCatalogue: (gymId: string): QueryKey => queryKeys.packCatalogue(gymId),
  /** The member's own profile. */
  profile: (gymId: string): QueryKey => queryKeys.profile(gymId),
  /** The member's training goals. */
  goals: (gymId: string): QueryKey => queryKeys.goals(gymId),
  /** The roster, every trainer detail, and the reviews nested under them. */
  trainers: (gymId: string): QueryKey => queryKeys.trainers(gymId),
  /** Bookable PT slots — sliced: `serviceSlots()` takes serviceId at [2]. */
  serviceSlots: (gymId: string): QueryKey => resourceRoot(queryKeys.serviceSlots(gymId, '')),
  /** The member's booked PT sessions — sliced: filters at [2]. */
  myServiceSessions: (gymId: string): QueryKey => resourceRoot(queryKeys.myServiceSessions(gymId)),
  /**
   * The inbox **and** the unread badge — sliced, deliberately. See this file's
   * header: the badge lives at `['notifications', gymId, 'unreadCount']` and is
   * only reachable from the two-segment prefix.
   */
  notifications: (gymId: string): QueryKey => resourceRoot(queryKeys.notifications(gymId)),
  /**
   * The member's own order history — sliced: `myOrders()` takes the pager at
   * [2], and an infinite query holds every page it has fetched under that one
   * bucket. The root reaches all of them, which is what makes a purchase show
   * up at the top of the Orders tab instead of behind a pull-to-refresh.
   */
  myOrders: (gymId: string): QueryKey => resourceRoot(queryKeys.myOrders(gymId)),
} as const;

/** The name of a cache root a matrix row may name. */
export type InvalidationTarget = keyof typeof RESOURCE_ROOTS;

/**
 * What each mutation invalidates on success.
 *
 * Read a row as "these screens now mean something different", not "these might
 * be stale". Every entry below has a stated reason; a row with no reason is a
 * row someone added defensively, and defensive invalidation is how a list ends
 * up refetching six queries on every keystroke.
 */
export const INVALIDATION_MATRIX = {
  /**
   * Seat totals move (`classes`), the booking appears (`bookings`), and a class
   * credit was **spent** (`creditPacks`) — the third is the one the old app
   * missed.
   */
  bookClass: ['classes', 'bookings', 'creditPacks'],
  /**
   * The mirror image: the seat is released or transferred to the promoted head
   * of the waitlist (`classes`), the booking flips to `CANCELED` (`bookings`),
   * and the credit is **refunded** (`creditPacks`) — unless the cancellation
   * window had passed, which is a 409 and never reaches here.
   */
  cancelBooking: ['classes', 'bookings', 'creditPacks'],
  /**
   * A membership now exists (`membership`), and with it the ability to book at
   * all — so every class card's affordance changed (`classes`).
   */
  enrollSubscription: ['membership', 'classes'],
  /**
   * Frozen means bookings fail with 409, so the schedule's affordances change
   * (`classes`) and existing bookings' cancel/attend actions change
   * (`bookings`), not just the membership card.
   */
  freezeSubscription: ['membership', 'classes', 'bookings'],
  /** Exactly the same three, in reverse. */
  unfreezeSubscription: ['membership', 'classes', 'bookings'],
  /**
   * A new pack with a fresh balance (`creditPacks`); the catalogue may hide a
   * one-per-member pack now that it is owned (`packCatalogue`).
   */
  purchaseCreditPack: ['creditPacks', 'packCatalogue'],
  /**
   * The membership funnel's purchase. One route, three product types, so the
   * union of what any of them can change: a subscription (`membership`), a
   * credit pack (`creditPacks`, `packCatalogue`), a package (`catalogue`), and
   * `bookings` because a fresh membership or credit balance changes what the
   * member may now book. The old app invalidated **none** of this.
   */
  createCheckout: ['membership', 'creditPacks', 'packCatalogue', 'catalogue', 'bookings'],
  /**
   * The cart mutations all answer with the whole authoritative cart, so their
   * `onSuccess` writes it straight into the cache with `setQueryData` — the
   * round trip is already paid for. The `cart` invalidation below is the
   * *settle-time* one, and it only fires when no other cart mutation is still in
   * flight, so a burst of stepper taps converges on one refetch instead of one
   * per tap.
   */
  addCartItem: ['cart'],
  updateCartItem: ['cart'],
  removeCartItem: ['cart'],
  /**
   * `201`. The cart is empty server-side, stock moved for every line bought — a
   * product listing showing "3 left" is now wrong (`products`) — and **an order
   * now exists** (`myOrders`), which is the row the member goes looking for on
   * the Orders tab. That last one is only invalidation, not a fetch: the tab is
   * usually not mounted, so the list is simply re-read the next time it is.
   */
  checkoutCart: ['cart', 'products', 'myOrders'],
  /**
   * `409 PRICE_CHANGED`. The server has **already re-priced the cart**, so the
   * cached cart is stale even though nothing was bought. Stock did not move.
   */
  checkoutCartPriceChanged: ['cart'],
  /**
   * `422 OUT_OF_STOCK`. The server **removed** the unfulfillable lines from the
   * cart, and it learned their stock is 0 — both caches are wrong.
   */
  checkoutCartOutOfStock: ['cart', 'products'],
  /** Name / phone changed. Nothing else reads them. */
  updateMyProfile: ['profile'],
  /** The whole goal set was replaced. */
  replaceMyGoals: ['goals'],
  /**
   * A review is posted against a *class occurrence*, but its effect is on the
   * **trainer**: `ReviewsService` recomputes the trainer's denormalised
   * `rating` / `reviewCount` in the same transaction. The client is never told
   * which trainer led the class, so the whole roster root is invalidated — and
   * because `trainerReviews` is nested under the trainer detail, one call takes
   * the review list with it and the average can never disagree with the list.
   */
  createReview: ['trainers'],
  /**
   * The slot flips `OPEN → BOOKED` (`serviceSlots`), it joins the member's
   * sessions (`myServiceSessions`), and it **raises an invoice** — and the
   * member's invoice history is part of `GET /me/subscription`, i.e.
   * `membership`. That last one is the non-obvious edge this table exists for.
   */
  bookServiceSession: ['myServiceSessions', 'serviceSlots', 'membership'],
  /**
   * The response already carries the new unread count, but other filter buckets
   * (an `unreadOnly: true` list) and the badge query are stale, and they live
   * under the same two-segment root.
   */
  markNotificationsRead: ['notifications'],
  /**
   * Push registration is device state, not gym state: nothing cached reads it.
   * The empty rows are deliberate and asserted — "we thought about it" is a
   * different claim from "nobody added a row".
   */
  registerPushToken: [],
  unregisterPushToken: [],
} as const satisfies Record<string, readonly InvalidationTarget[]>;

/** The name of every mutation this package ships. */
export type MutationName = keyof typeof INVALIDATION_MATRIX;

/**
 * Invalidate everything a mutation's row names.
 *
 * Fire-and-forget: `invalidateQueries` resolves when the refetches settle, and
 * awaiting it inside `onSuccess` would keep the mutation `isPending` — a save
 * button spinning until the network catches up on five unrelated queries.
 */
export function invalidateFor(client: QueryClient, gymId: string, mutation: MutationName): void {
  for (const target of INVALIDATION_MATRIX[mutation]) {
    void client.invalidateQueries({ queryKey: RESOURCE_ROOTS[target](gymId) });
  }
}
