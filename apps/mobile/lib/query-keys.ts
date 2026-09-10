// @fit/mobile — the app's query-key factory.
//
// ## The one invariant: `gymId` is segment [1] of every gym-scoped key
//
//     ['classes', gymId, 'detail', classId]
//                 ^^^^^
//
// Switching gym means re-login — there is no tenant-switch endpoint, and the
// session's tenant is fixed at issuance in the access token's `gymId` claim
// (D4). So a cache entry minted under gym A that is still readable under gym B
// is not a staleness bug, it is one tenant's data rendered inside another
// tenant's session: a data leak wearing a caching bug's clothes. Putting the
// tenant at a fixed position makes that unrepresentable, and makes per-gym
// eviction the one-liner {@link evictGym} below rather than an audit of every
// call site.
//
// The position is enforced by `query-keys.spec.ts`, which builds every factory
// and asserts index 1 — so a refactor cannot quietly drop the prefix. Adding a
// non-gym-scoped key means adding it to {@link NON_GYM_SCOPED_KEYS}, which is a
// deliberate, reviewable act.
//
// Convention: the *resource root* comes first so `invalidateQueries({ queryKey:
// queryKeys.classes(gymId) })` invalidates the list and every detail under it.

import type { QueryClient } from '@tanstack/react-query';

/** A query key is always an array whose first element names the resource. */
export type QueryKey = readonly unknown[];

/**
 * Arbitrary, serialisable filter/params objects. Passed as the last segment so
 * TanStack's structural hashing keys on their contents, not their identity.
 */
export type Filters = Record<string, unknown> | undefined;

/**
 * Every key the app uses.
 *
 * Each gym-scoped factory takes `gymId` first — the argument order *is* the
 * invariant, which is why no factory takes it anywhere else.
 */
export const queryKeys = {
  // ── Classes ──────────────────────────────────────────────────────────────
  /** Root for everything class-shaped in one gym. Invalidate to refresh all. */
  classes: (gymId: string) => ['classes', gymId] as const,
  /** A filtered schedule listing (date range, location, class type). */
  classList: (gymId: string, filters?: Filters) =>
    ['classes', gymId, 'list', filters ?? null] as const,
  /** One class instance. */
  classDetail: (gymId: string, classId: string) => ['classes', gymId, 'detail', classId] as const,

  // ── Bookings ─────────────────────────────────────────────────────────────
  /** Root for the signed-in member's bookings. */
  bookings: (gymId: string) => ['bookings', gymId] as const,
  /** A filtered bookings listing (upcoming / past). */
  bookingList: (gymId: string, filters?: Filters) =>
    ['bookings', gymId, 'list', filters ?? null] as const,

  // ── Shop ─────────────────────────────────────────────────────────────────
  /** The server-side cart (`GET /cart`) — scoped by Bearer, so by gym (D3). */
  cart: (gymId: string) => ['cart', gymId] as const,
  /**
   * The join funnel's aggregate catalogue, optionally narrowed to one branch.
   *
   * `locationId` is a **key segment, not decoration**: `GET /catalogue?locationId=`
   * narrows the package list, so without it the same key would serve two
   * different requests and switching branch would hand back the previous
   * branch's catalogue out of the cache and never refetch. The filter bucket
   * sits at index 2, the shape `products` and `notifications` already have, so
   * `resourceRoot()` recovers `['catalogue', gymId]` and prefix invalidation
   * still reaches every branch — see `hooks/mutations/invalidation.ts`.
   */
  catalogue: (gymId: string, locationId?: string) =>
    ['catalogue', gymId, locationId ?? null] as const,
  /** The retail product listing. */
  products: (gymId: string, filters?: Filters) => ['products', gymId, filters ?? null] as const,
  /**
   * Purchasable service packages, optionally narrowed to one branch.
   *
   * Same reasoning as {@link queryKeys.catalogue}: `GET /packages?locationId=`
   * is a different request, so it is a different bucket.
   */
  packages: (gymId: string, locationId?: string) =>
    ['packages', gymId, locationId ?? null] as const,
  /**
   * A created order, read back after checkout. Keyed by `orderId` so the
   * post-checkout screen can be deep-linked to and refetched independently.
   */
  checkoutOrder: (gymId: string, orderId: string) => ['checkoutOrder', gymId, orderId] as const,
  /**
   * The member's own order history (`GET /me/orders`) — the Orders tab's list.
   *
   * A separate root from {@link queryKeys.checkoutOrder}, deliberately: that key
   * holds ONE order read back by id from `GET /checkout/:orderId`, and this one
   * holds pages of summaries from a different route. Folding them together would
   * make "invalidate the history" also drop every confirmation screen's cache,
   * and an order is immutable once placed.
   *
   * The filter bucket sits at index 2 — the shape `products` and `notifications`
   * already have — so the pages of an infinite query live under it and
   * `resourceRoot()` still recovers `['myOrders', gymId]` for invalidation.
   */
  myOrders: (gymId: string, filters?: Filters) => ['myOrders', gymId, filters ?? null] as const,

  // ── Gym ──────────────────────────────────────────────────────────────────
  /** The gym's branches — pickup locations, class venues, opening hours. */
  locations: (gymId: string) => ['locations', gymId] as const,
  /**
   * Home's promotional carousel (`GET /banners`).
   *
   * Gym-scoped like everything else, even though the route needs no session: the
   * reel is one tenant's marketing, and a slide minted under gym A rendered
   * inside gym B's session is the same class of leak as any other — one gym's
   * campaign, shown to another gym's member, with a link into its shop.
   */
  banners: (gymId: string) => ['banners', gymId] as const,

  // ── Trainers ─────────────────────────────────────────────────────────────
  /** Root for the trainer roster. */
  trainers: (gymId: string) => ['trainers', gymId] as const,
  /** One trainer's profile. */
  trainer: (gymId: string, trainerId: string) => ['trainers', gymId, 'detail', trainerId] as const,
  /**
   * A trainer's reviews. Nested under the trainer detail key so posting a review
   * can invalidate the trainer and take the reviews with it — the rating shown
   * on the profile is derived from them and must not disagree.
   */
  trainerReviews: (gymId: string, trainerId: string, filters?: Filters) =>
    ['trainers', gymId, 'detail', trainerId, 'reviews', filters ?? null] as const,

  // ── Membership ───────────────────────────────────────────────────────────
  /** The member's current subscription: plan, status, period, freeze state. */
  membership: (gymId: string) => ['membership', gymId] as const,
  /** The member's owned credit packs and their remaining balances. */
  creditPacks: (gymId: string) => ['creditPacks', gymId] as const,
  /** The credit packs on sale. */
  packCatalogue: (gymId: string) => ['packCatalogue', gymId] as const,

  // ── Account ──────────────────────────────────────────────────────────────
  /** The member's own profile. */
  profile: (gymId: string) => ['profile', gymId] as const,
  /** The member's training goals. */
  goals: (gymId: string) => ['goals', gymId] as const,

  // ── Personal training / services ─────────────────────────────────────────
  /** Bookable slots for one service, optionally narrowed to a date. */
  serviceSlots: (gymId: string, serviceId: string, filters?: Filters) =>
    ['serviceSlots', gymId, serviceId, filters ?? null] as const,
  /** The member's booked service sessions. */
  myServiceSessions: (gymId: string, filters?: Filters) =>
    ['myServiceSessions', gymId, filters ?? null] as const,

  // ── Notifications ────────────────────────────────────────────────────────
  /** The notification inbox. */
  notifications: (gymId: string, filters?: Filters) =>
    ['notifications', gymId, filters ?? null] as const,
  /**
   * The unread badge count. Nested under `notifications` so reading the inbox
   * invalidates the badge — the two disagreeing is the classic "badge says 3,
   * inbox is empty" bug.
   */
  unreadCount: (gymId: string) => ['notifications', gymId, 'unreadCount'] as const,

  // ── Not gym-scoped ───────────────────────────────────────────────────────
  /**
   * Resolve a gym by its public slug.
   *
   * The **only** key without a `gymId` prefix, and necessarily so: it is what
   * the join / login flow calls *before* a session exists, so there is no gym
   * to scope it by. It carries nothing member-specific — only the public tenant
   * record — so it is safe to survive a session change. Listed in
   * {@link NON_GYM_SCOPED_KEYS} so the spec treats the omission as intentional.
   */
  gymBySlug: (slug: string) => ['gymBySlug', slug] as const,
} as const;

/** The name of every factory on {@link queryKeys}. */
export type QueryKeyName = keyof typeof queryKeys;

/**
 * Factories that intentionally carry no `gymId`.
 *
 * The allowlist exists so the invariant is enforced by default: a new key is
 * gym-scoped unless someone writes its name here, in a diff a reviewer sees.
 */
export const NON_GYM_SCOPED_KEYS: readonly QueryKeyName[] = ['gymBySlug'];

/** Whether `name` must carry `gymId` at index 1. */
export function isGymScoped(name: QueryKeyName): boolean {
  return !NON_GYM_SCOPED_KEYS.includes(name);
}

/**
 * Drop every cached entry belonging to `gymId`, leaving other gyms' (and the
 * non-scoped) entries alone.
 *
 * The payoff of the index-[1] invariant: one predicate, no per-resource list to
 * keep in sync. Note this is *not* the sign-out path — `endSession()` clears the
 * whole cache, because on sign-out even the non-scoped entries were fetched
 * under someone's session.
 */
export function evictGym(client: QueryClient, gymId: string): void {
  client.removeQueries({
    predicate: (query) => query.queryKey[1] === gymId,
  });
}
