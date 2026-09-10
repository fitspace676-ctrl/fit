// @fit/mobile — the single typed route table. **Every** request the app makes
// resolves its method and path here; no fetcher anywhere writes a template
// literal into `apiJson`.
//
// ## Why this file exists
//
// The deleted app called `POST /orders` — a route that does not exist — and
// `GET /orders/:id`, which is gated on `BillingRead`, a permission the `MEMBER`
// role does not hold. Shop checkout could therefore never have succeeded: the
// first call 404'd, the second 403'd, and because the old client did not throw
// (D7), the screen rendered a success state either way. Nothing in the codebase
// could have caught it, because the URL existed only as a string inside one
// component.
//
// The member-safe pair is `POST /cart/checkout` → `GET /checkout/:orderId`.
//
// So the routes are *data* now. Each entry declares:
//
//   - `method` — the HTTP verb, which is what the fetcher passes to `apiJson`,
//   - `path`   — the pattern, with `:name` placeholders filled by
//                {@link endpointPath} (which percent-encodes and refuses a
//                missing one, so a stray `undefined` can never reach the wire),
//   - `permission` — `'public'` for a route `apps/api` marks `@Public()`, or the
//                tuple of {@link Permission}s its `@RequirePermissions(...)`
//                names.
//
// `ENDPOINTS` is a plain `const` object, deliberately: `scripts/build-route-manifest.ts`
// walks `apps/api`'s controllers with the TypeScript AST and AST-walks this table
// directly to assert that (a) every entry matches a real route and (b) it needs
// only permissions `ROLE_PERMISSIONS.MEMBER` grants. A function, a class, or a
// lazily-built map would all be opaque to that check.
//
// ## What is deliberately absent
//
// Routes a `MEMBER` cannot call do not appear here **at all** — an entry the
// manifest checker would have to special-case is an entry that will eventually
// be called:
//
//   - everything under `/admin/*` (including `/admin/service-sessions`, which is
//     `ClassRead`/`ClassWrite`),
//   - `/members/*` except `GET /members/me/credit-packs`,
//   - `/orders/*` — the staff console's order surface (`BillingRead`),
//   - `GET /invoices/:id/pdf` — also `BillingRead`; the member-safe equivalent is
//     `GET /me/invoices/:invoiceId/pdf`,
//   - `/loyalty/*`,
//   - `GET /gyms` — guarded by `TenantGuard` + `@AllowCrossTenant()`, i.e. the
//     whole-platform roster, SUPER_ADMIN only. Only `GET /gyms/by-subdomain/:slug`
//     is public.
//
// Verified against `apps/api/src/**/*.controller.ts` and
// `packages/types/src/permissions.ts` on 2026-08-31.

import { Permission } from '@fit/types';

/** The verbs `apiFetch` understands. */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * What authorization a route demands.
 *
 * `'public'` mirrors `apps/api`'s `@Public()` decorator — exempt from the global
 * deny-by-default `PermissionsGuard`. Otherwise it is the exact list from
 * `@RequirePermissions(...)`, which the guard requires **all** of (see
 * `apps/api/src/common/rbac/permissions.guard.ts`), which is why
 * `POST /checkout` carries two.
 */
export type EndpointPermission = 'public' | readonly Permission[];

/** One route. */
export interface EndpointSpec {
  readonly method: HttpMethod;
  /** Path pattern, API-relative, with `:name` placeholders. */
  readonly path: string;
  readonly permission: EndpointPermission;
}

/**
 * Every route the member app is allowed to call.
 *
 * Grouped by controller, in the order the controllers appear under
 * `apps/api/src/`. Keys are the call sites' vocabulary, not the URLs.
 */
export const ENDPOINTS = {
  // ── classes/classes.controller.ts — `@Controller('class-instances')` ──────
  /** `GET /class-instances?gymId&from&to&view?` — the schedule. */
  listClasses: { method: 'GET', path: '/class-instances', permission: 'public' },
  /** `GET /class-instances/:id?gymId` — one occurrence's detail. */
  getClass: { method: 'GET', path: '/class-instances/:id', permission: 'public' },
  /**
   * `GET /class-instances/occupancy/stream?gymId` — the live seat-count feed.
   *
   * A Nest `@Sse()` handler, which registers as a GET route; the transport is
   * `text/event-stream`, so it is consumed with an `EventSource`
   * (`react-native-sse`), never with `apiJson`. It is listed here anyway because
   * "every URL comes from this table" has no exceptions — `lib/api/classes.ts`
   * exports the built URL and the screen layer opens the socket.
   */
  streamClassOccupancy: {
    method: 'GET',
    path: '/class-instances/occupancy/stream',
    permission: 'public',
  },

  // ── classes/bookings.controller.ts — `@Controller('class-instances')` ─────
  /** `POST /class-instances/:id/bookings` — book (or waitlist). `200`, not `201`. */
  bookClass: {
    method: 'POST',
    path: '/class-instances/:id/bookings',
    permission: [Permission.ClassBook],
  },
  /** `DELETE /class-instances/:id/bookings` — release the caller's seat. */
  cancelBooking: {
    method: 'DELETE',
    path: '/class-instances/:id/bookings',
    permission: [Permission.ClassBook],
  },

  // ── classes/member-bookings.controller.ts — `@Controller('me/bookings')` ──
  /** `GET /me/bookings?scope` — the caller's booking history. */
  listMyBookings: { method: 'GET', path: '/me/bookings', permission: [Permission.ClassBook] },

  // ── me/*.controller.ts ───────────────────────────────────────────────────
  /** `GET /me/profile`. */
  getMyProfile: { method: 'GET', path: '/me/profile', permission: [Permission.ProfileManage] },
  /** `PATCH /me/profile` — partial; `phone: null` clears. */
  updateMyProfile: { method: 'PATCH', path: '/me/profile', permission: [Permission.ProfileManage] },
  /** `GET /me/goals`. */
  getMyGoals: { method: 'GET', path: '/me/goals', permission: [Permission.ProfileManage] },
  /** `PUT /me/goals` — whole-set replace, max 8. */
  replaceMyGoals: { method: 'PUT', path: '/me/goals', permission: [Permission.ProfileManage] },
  /** `GET /me/subscription` — the membership **and** its invoice history. */
  getMySubscription: {
    method: 'GET',
    path: '/me/subscription',
    permission: [Permission.SubscriptionManage],
  },
  /**
   * `GET /me/invoices/:invoiceId/pdf` — the member-safe invoice download.
   *
   * The console's `GET /invoices/:id/pdf` is `BillingRead` and would 403 here;
   * this route is `SubscriptionManage`, which every `MEMBER` holds.
   */
  getMyInvoicePdf: {
    method: 'GET',
    path: '/me/invoices/:invoiceId/pdf',
    permission: [Permission.SubscriptionManage],
  },
  /**
   * `GET /me/orders?page&limit` — the caller's own purchase history.
   *
   * The member-safe list, and the missing half of a pair that had only a detail:
   * `GET /checkout/:orderId` can confirm one order, but only for an id the app
   * already held. The roster — `GET /orders`, `OrdersController` — is
   * `BillingRead`, which no member holds, so it is absent from this table
   * entirely; that 403 is what this route replaces. `ProfileManage`, like the
   * other `/me` reads.
   */
  listMyOrders: { method: 'GET', path: '/me/orders', permission: [Permission.ProfileManage] },

  // ── subscriptions/subscriptions.controller.ts ────────────────────────────
  /** `POST /subscriptions` — self-enrolment; only `planId` crosses the wire. */
  enrollSubscription: {
    method: 'POST',
    path: '/subscriptions',
    permission: [Permission.SubscriptionManage],
  },
  /** `POST /subscriptions/:id/freeze`. */
  freezeSubscription: {
    method: 'POST',
    path: '/subscriptions/:id/freeze',
    permission: [Permission.SubscriptionManage],
  },
  /** `POST /subscriptions/:id/unfreeze`. */
  unfreezeSubscription: {
    method: 'POST',
    path: '/subscriptions/:id/unfreeze',
    permission: [Permission.SubscriptionManage],
  },

  // ── billing/{credit-packs,member-credit-packs}.controller.ts ─────────────
  /** `POST /credit-packs/purchase`. */
  purchaseCreditPack: {
    method: 'POST',
    path: '/credit-packs/purchase',
    permission: [Permission.CreditPackManage],
  },
  /** `GET /credit-packs/catalogue` — the packs on sale. */
  listCreditPackCatalogue: {
    method: 'GET',
    path: '/credit-packs/catalogue',
    permission: [Permission.CreditPackManage],
  },
  /**
   * `GET /members/me/credit-packs` — the caller's own packs and balances.
   *
   * The one `/members/*` route in this table. Every other one is `MemberRead` /
   * `MemberWrite` (the staff roster); this is `CreditPackManage`, i.e. member
   * self-service that merely happens to live under that prefix.
   */
  listMyCreditPacks: {
    method: 'GET',
    path: '/members/me/credit-packs',
    permission: [Permission.CreditPackManage],
  },

  // ── catalogue/catalogue.controller.ts ────────────────────────────────────
  /** `GET /catalogue?gymId&locationId?` — plans, packages, packs, intake settings. */
  getCatalogue: { method: 'GET', path: '/catalogue', permission: 'public' },

  // ── catalogue/checkout.controller.ts ─────────────────────────────────────
  /**
   * `POST /checkout` — buy a plan / package / credit pack.
   *
   * Requires **both** capabilities; `MEMBER` holds both, which is exactly why
   * this — and not `POST /orders` — is the member's purchase route.
   */
  createCheckout: {
    method: 'POST',
    path: '/checkout',
    permission: [Permission.CreditPackManage, Permission.SubscriptionManage],
  },
  /**
   * `GET /checkout/:orderId` — the confirmation summary.
   *
   * The member-safe replacement for `GET /orders/:orderId` (`BillingRead` → 403).
   * Someone else's order id is a `404`, never a disclosure.
   */
  getCheckoutOrder: {
    method: 'GET',
    path: '/checkout/:orderId',
    permission: [Permission.CreditPackManage, Permission.SubscriptionManage],
  },

  // ── cart/cart.controller.ts — the whole controller is `@Public()` ─────────
  //
  // Not "unauthenticated": `CartIdentityMiddleware` scopes a signed-in cart by
  // the Bearer token. `@Public()` only means the RBAC guard is skipped, because
  // a guest on a gym subdomain reaches the same routes by cookie. The app never
  // sends a cookie (`credentials: 'omit'`, D3), so its cart is always the
  // Bearer-scoped one.
  /** `GET /cart` — the cart, re-priced live. Never creates one. */
  getCart: { method: 'GET', path: '/cart', permission: 'public' },
  /** `POST /cart/items` — add a variant (or bump an existing line). */
  addCartItem: { method: 'POST', path: '/cart/items', permission: 'public' },
  /** `PATCH /cart/items/:variantId` — set a line's absolute quantity. */
  updateCartItem: { method: 'PATCH', path: '/cart/items/:variantId', permission: 'public' },
  /** `DELETE /cart/items/:variantId` — remove a line (idempotent). */
  removeCartItem: { method: 'DELETE', path: '/cart/items/:variantId', permission: 'public' },
  /**
   * `POST /cart/checkout` — the shop's real purchase route.
   *
   * `201 { orderId }`; `409 { code: 'PRICE_CHANGED', newPrices }`;
   * `422 { code: 'OUT_OF_STOCK', removedItems }`. The controller hand-sets those
   * two statuses with `res.status(...)` and a normal return precisely so the
   * global exception filter never flattens the extra fields away — which is why
   * this is the one route the client reads as a discriminated result rather than
   * a throw (documented exception #1, `lib/http/api-client.ts`).
   */
  checkoutCart: { method: 'POST', path: '/cart/checkout', permission: 'public' },

  // ── products / packages / locations / services — public catalogues ───────
  /** `GET /products?gymId`. */
  listProducts: { method: 'GET', path: '/products', permission: 'public' },
  /** `GET /packages?gymId&locationId?`. */
  listPackages: { method: 'GET', path: '/packages', permission: 'public' },
  /** `GET /locations?gymId` — branches, pickup points, hours. */
  listLocations: { method: 'GET', path: '/locations', permission: 'public' },
  /** `GET /services?gymId` — the personal-training service catalogue. */
  listServices: { method: 'GET', path: '/services', permission: 'public' },

  // ── services/service-sessions.controller.ts ──────────────────────────────
  //
  // Three controllers share this file. `@Controller('admin/service-sessions')`
  // is `ClassRead` / `ClassWrite` — staff only, and absent from this table.
  /** `GET /service-sessions?gymId&serviceId?&from&to` — bookable OPEN slots. */
  listServiceSlots: { method: 'GET', path: '/service-sessions', permission: 'public' },
  /** `GET /me/service-sessions` — the caller's booked sessions. */
  listMyServiceSessions: {
    method: 'GET',
    path: '/me/service-sessions',
    permission: [Permission.ClassBook],
  },
  /** `POST /me/service-sessions/:id/book` — claim a slot; raises an invoice. */
  bookServiceSession: {
    method: 'POST',
    path: '/me/service-sessions/:id/book',
    permission: [Permission.ClassBook],
  },

  // ── trainers/trainers.controller.ts ──────────────────────────────────────
  /** `GET /trainers?gymId`. */
  listTrainers: { method: 'GET', path: '/trainers', permission: 'public' },
  /** `GET /trainers/:id?gymId`. */
  getTrainer: { method: 'GET', path: '/trainers/:id', permission: 'public' },

  // ── reviews/{reviews,trainer-reviews}.controller.ts ──────────────────────
  /** `POST /reviews` — rate a class the caller attended. `201`. */
  createReview: { method: 'POST', path: '/reviews', permission: [Permission.ReviewWrite] },
  /** `GET /trainers/:id/reviews?gymId&page&limit` — public, paginated + aggregate. */
  listTrainerReviews: { method: 'GET', path: '/trainers/:id/reviews', permission: 'public' },

  // ── notifications/{notification-inbox,push-token}.controller.ts ──────────
  /** `GET /notifications?page&limit&unreadOnly?`. */
  listNotifications: {
    method: 'GET',
    path: '/notifications',
    permission: [Permission.NotificationManage],
  },
  /** `GET /notifications/unread-count` — the bell badge. */
  getUnreadCount: {
    method: 'GET',
    path: '/notifications/unread-count',
    permission: [Permission.NotificationManage],
  },
  /** `POST /notifications/mark-read` — `ids` omitted means "mark all". */
  markNotificationsRead: {
    method: 'POST',
    path: '/notifications/mark-read',
    permission: [Permission.NotificationManage],
  },
  /** `POST /notifications/push-token` — upsert by `(userId, deviceId)`. */
  registerPushToken: {
    method: 'POST',
    path: '/notifications/push-token',
    permission: [Permission.NotificationManage],
  },
  /** `DELETE /notifications/push-token/:deviceId` — `204`. Part of sign-out. */
  unregisterPushToken: {
    method: 'DELETE',
    path: '/notifications/push-token/:deviceId',
    permission: [Permission.NotificationManage],
  },

  // ── banners/banners.controller.ts ────────────────────────────────────────
  /**
   * `GET /banners?gymId` — the home carousel's live slides, in reel order.
   *
   * `@Public()`, and `banners` is excluded from the JWT `TenantMiddleware` in
   * `AppModule`, so the gym is identified by the query param the app resolves
   * from its configured slug rather than by a session — the `GET /trainers`
   * convention exactly. The API has already dropped the parked, the artless and
   * the out-of-window rows; the client draws what it is given, in order.
   */
  listBanners: { method: 'GET', path: '/banners', permission: 'public' },

  // ── gyms/gyms.controller.ts ──────────────────────────────────────────────
  /**
   * `GET /gyms/by-subdomain/:slug` — the public tenant lookup.
   *
   * `GET /gyms` is *not* here: it is `TenantGuard` + `@AllowCrossTenant()`, the
   * whole-platform roster, and `Gym` is not a tenant-scoped model — without that
   * guard any authenticated user could read every gym on the platform.
   */
  getGymBySubdomain: {
    method: 'GET',
    path: '/gyms/by-subdomain/:slug',
    permission: 'public',
  },
} as const satisfies Record<string, EndpointSpec>;

/** The name of every route in {@link ENDPOINTS}. */
export type EndpointName = keyof typeof ENDPOINTS;

/**
 * What every fetcher in `lib/api/` accepts on top of its own arguments.
 *
 * Only a cancellation signal — TanStack Query hands one to every `queryFn`, and
 * forwarding it is what makes a screen the user navigated away from stop
 * fetching instead of resolving into a dead cache entry. Declared here (a pure
 * type) rather than in each module so the thirteen fetcher files agree on it
 * without importing one another.
 */
export interface FetchOptions {
  readonly signal?: AbortSignal | null;
}

/** Matches a `:name` placeholder in a path pattern. */
const PLACEHOLDER = /:([A-Za-z0-9_]+)/g;

/**
 * Fill a spec's `:name` placeholders and return the API-relative path.
 *
 * Every value is percent-encoded, and a missing / blank one **throws** rather
 * than producing `/class-instances/undefined/bookings`. That string is a real
 * URL: it reaches the server, 404s, and — before D7 — rendered as an empty
 * state. Failing in the fetcher instead turns it into a stack trace pointing at
 * the call site.
 */
export function endpointPath(
  endpoint: EndpointSpec,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return endpoint.path.replace(PLACEHOLDER, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`Missing path parameter "${name}" for ${endpoint.method} ${endpoint.path}`);
    }
    return encodeURIComponent(String(value));
  });
}

/** Whether a route is exempt from the API's permission guard. */
export function isPublic(endpoint: EndpointSpec): boolean {
  return endpoint.permission === 'public';
}

/** The permissions a route requires — empty for a `@Public()` one. */
export function requiredPermissions(endpoint: EndpointSpec): readonly Permission[] {
  return endpoint.permission === 'public' ? [] : endpoint.permission;
}
