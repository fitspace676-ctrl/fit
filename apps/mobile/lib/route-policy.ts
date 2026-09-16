// @fit/mobile — the route guard, expressed as data.
//
// ## What the old guard got wrong
//
// The salvaged `useProtectedRoute` was four `if`s, and its very first one was:
//
//     if (!session) { if (!inAuthGroup) router.replace('/login'); }
//
// Every signed-out user, on every route, was thrown at `/login`. But `classes`,
// class detail, `trainers`, `services`, service slots, `products`, `locations`,
// `packages`, the plan catalogue and the whole cart are `@Public()` on the API,
// and the web member portal renders every one of them signed out on purpose.
// So that single line made public discovery unreachable from the app and made a
// **signed-out purchase impossible** — which is the entire join funnel, the one
// flow that converts a visitor into a paying member. It was not a missing case;
// it was the wrong default.
//
// ## The shape of the fix
//
// The zone table is *data* — {@link ROUTE_POLICY} — consumed by one pure
// function, {@link resolveRedirect}. Three consequences:
//
//   - Every cell is unit-testable without a renderer, a router, or a session.
//     The old guard's table lived inside a `useEffect` and could only be
//     exercised by mounting the whole app, which is why it was never tested and
//     why it was wrong for months.
//   - Adding a screen is a one-line diff in a table a reviewer can read, not a
//     branch appended to a conditional cascade.
//   - The default is **`auth`** (fail closed). A new screen is protected until
//     someone deliberately writes it down as public, so the failure mode of
//     forgetting is "asked to sign in", never "member data rendered to a
//     stranger".
//
// ## Membership is not a routing input
//
// A signed-in user with no active gym membership has a token with no `gymId`
// claim, so `SessionState.gymId` is `null`. That must **never** cause a
// redirect: routing is about identity, not entitlement. The screens gate
// themselves — a membership-locked CTA renders its own "no plan" state, in
// place, with the join funnel one tap away. Bouncing such a user to a wall would
// be the same mistake as the old `/login` bounce, one layer up.
// `resolveRedirect` therefore never reads `gymId`, and the spec asserts that by
// running the whole table twice, with and without one.

import type { SessionState } from './auth/session';

/** How a route behaves for a signed-out visitor. */
export type RoutePolicy =
  /** Fully renderable signed out. The API route behind it is `@Public()`. */
  | 'public'
  /** Requires a session. Signed out → `/login?next=…`. */
  | 'auth'
  /**
   * Renderable signed out, but its primary action is not: book a class, add to
   * cart, check out. The screen renders, the CTA prompts. Identical to `public`
   * for redirect purposes — the difference is which component the *screen*
   * draws, and it is written down here so that decision is reviewable rather
   * than rediscovered per screen.
   */
  | 'auth-soft';

/** The `(auth)` route group: login, register, forgot, reset, verify. */
export const AUTH_GROUP = '(auth)';

/** The onboarding intro. Not in {@link ROUTE_POLICY}; it has its own zone. */
export const ONBOARDING_ROUTE = 'onboarding';

/** Where a signed-out user is sent from an `auth` route. */
export const LOGIN_ROUTE = '/login';

/** Where a signed-in, onboarded user is sent out of `(auth)` / onboarding. */
export const HOME_ROUTE = '/home';

/** Applied to any route not named in {@link ROUTE_POLICY}. Fail closed. */
export const DEFAULT_POLICY: RoutePolicy = 'auth';

/**
 * Route group / path prefix → policy, matched **longest prefix first** so a
 * detail route can be stricter than its list (`services` is public, booking a
 * slot under it is not) without repeating the whole tree.
 *
 * Keys are `useSegments()` paths with route groups left in, exactly as
 * expo-router reports them, because the group *is* part of the identity: `(join)`
 * and `(tabs)` can both contain a `checkout`.
 */
export const ROUTE_POLICY: Readonly<Record<string, RoutePolicy>> = {
  // ── The entry route ──────────────────────────────────────────────────────
  // `useSegments()` is `[]` at `/`. Public so a cold launch never bounces
  // through `/login`; the index screen itself redirects a signed-in user on.
  '': 'public',

  // ── The join funnel ──────────────────────────────────────────────────────
  // The whole point: buy a membership from a cold start with no account. The
  // wizard creates the account at its own step, so requiring one first would be
  // circular. (`(auth)` is handled outside this table — see resolveRedirect.)
  '(join)': 'public',

  // ── Tabs ─────────────────────────────────────────────────────────────────
  // The group default is `auth`; the two discovery tabs opt out.
  '(tabs)/home': 'auth',
  '(tabs)/classes': 'public',
  '(tabs)/classes/[id]': 'auth-soft',
  '(tabs)/shop': 'public',
  // The product screen is `app/(tabs)/shop/product/[id].tsx`, so the key has to
  // carry the `product` segment. Written as `'(tabs)/shop/[id]'` it named no
  // route at all: a dead row that matched nothing, while the real product route
  // silently inherited `'(tabs)/shop'` — the right policy by accident rather
  // than by declaration, in a table whose entire value is being readable data.
  '(tabs)/shop/product/[id]': 'public',
  // `order` is `auth` further down this table, but `policyFor` matches by
  // LONGEST prefix and the order screen lives *under* the shop tab — so
  // `'(tabs)/shop': 'public'` won every time and the order confirmation, which
  // reads `GET /orders/:id` with a Bearer, was never gated. The entry below is
  // the longer prefix, so it wins.
  '(tabs)/shop/order': 'auth',
  '(tabs)/profile': 'auth',

  // ── ROOT-LEVEL NAMES ─────────────────────────────────────────────────────
  //
  // Everything from here down is keyed on a BARE name, and `policyFor` matches
  // prefixes from segment 0 — so these govern a route only if that name is its
  // FIRST segment. Today that is true of exactly four: `trainers`, `services`
  // (+ `services/[id]`), `membership`, and `qr`. Every other screen lives under
  // `(tabs)` or `(join)` and is governed by the grouped keys above.
  //
  // The rest are NOT dead weight and should not be tidied away: they are the
  // fail-closed default for a route that does not exist yet. `app/billing.tsx`
  // added tomorrow is `auth` from its first render rather than from the first
  // time somebody notices. Read them as "if this name ever becomes a root
  // route, this is its policy" — not as a description of today's screens.
  //
  // ── Discovery (public read, gated action) ────────────────────────────────
  classes: 'public',
  // `GET /classes/:id` is public; `POST /bookings` is not. The screen renders
  // the class to a signed-out visitor and prompts at the Book button, which is
  // what `next=` exists to return them from.
  'classes/[id]': 'auth-soft',
  trainers: 'public',
  services: 'public',
  'services/[id]': 'auth-soft',
  // Bookable slots for a service — public to read, sign-in to take one.
  slots: 'auth-soft',
  products: 'public',
  'products/[id]': 'public',
  locations: 'public',
  packages: 'public',
  catalogue: 'public',

  // ── Cart + checkout ──────────────────────────────────────────────────────
  // `GET /cart` signed out resolves to an empty cart by construction
  // (`getCartOrEmpty`), so the cart screen is reachable; checkout prompts.
  cart: 'auth-soft',
  checkout: 'auth-soft',
  order: 'auth',

  // ── Account (session required) ───────────────────────────────────────────
  home: 'auth',
  // The scanner, opened from the capsule's centre action. It is a REAL root
  // route (`app/qr.tsx`), so this row governs something today rather than
  // reserving a name — and it is `auth` for the same reason every account
  // screen is: the capsule that opens it only exists inside the signed-in
  // shell, so a signed-out arrival here is a deep link, and a deep link into a
  // check-in surface should land on sign-in and come back through `next=`.
  qr: 'auth',
  bookings: 'auth',
  membership: 'auth',
  billing: 'auth',
  goals: 'auth',
  notifications: 'auth',
  settings: 'auth',
  profile: 'auth',
};

/**
 * The policy governing `segments`, by longest-prefix match, defaulting to
 * {@link DEFAULT_POLICY}.
 */
export function policyFor(segments: readonly string[]): RoutePolicy {
  // The `''` key names the index route *only*. It must not be reachable as the
  // zero-length prefix of every other path, or it would silently become the
  // table's default and undo the fail-closed rule above.
  if (segments.length === 0) {
    return ROUTE_POLICY[''] ?? DEFAULT_POLICY;
  }
  for (let end = segments.length; end >= 1; end -= 1) {
    const key = segments.slice(0, end).join('/');
    const policy = ROUTE_POLICY[key];
    if (policy !== undefined) {
      return policy;
    }
  }
  return DEFAULT_POLICY;
}

/**
 * The href form of a segment list: route groups dropped (expo-router strips
 * `(group)` from URLs), everything else joined.
 *
 * Note `useSegments()` reports the *route* name for a dynamic segment — `[id]`,
 * not the id — so a path built from segments alone is a template. Pass the real
 * href through {@link ResolveRedirectOptions.pathname} when the `next=` value has
 * to survive a round trip through the sign-in screen.
 */
export function pathFromSegments(segments: readonly string[]): string {
  const parts = segments.filter((segment) => !isGroup(segment));
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

function isGroup(segment: string): boolean {
  return segment.startsWith('(') && segment.endsWith(')');
}

/** Optional inputs {@link resolveRedirect} uses when they are available. */
export interface ResolveRedirectOptions {
  /**
   * The resolved href of the current route, for the `next=` parameter. Defaults
   * to {@link pathFromSegments}, which cannot know a dynamic segment's value.
   */
  pathname?: string;
}

/**
 * Where this user must be sent, or `null` to leave them where they are.
 *
 * The complete zone table, in evaluation order:
 *
 * | session | onboarded | route | result |
 * |---|---|---|---|
 * | hydrating | — | any | `null` — nothing is known yet; a redirect here is the launch flash |
 * | signed out | — | `(auth)/*` | `null` |
 * | signed out | — | `onboarding` | `null` — the intro explains the app, not the account |
 * | signed out | — | `public` / `auth-soft` (incl. `(join)/*`) | `null` |
 * | signed out | — | `auth` | `/login?next=<path>` |
 * | signed in | no | `onboarding` | `null` |
 * | signed in | no | anything else | `/onboarding` |
 * | signed in | yes | `(auth)/*` or `onboarding` | `/home` |
 * | signed in | yes | anything else | `null` |
 *
 * `gymId` appears nowhere in it, deliberately — see this file's header.
 *
 * Pure: no router, no store, no side effect. Navigation is the screen layer's
 * job; this only says where.
 */
export function resolveRedirect(
  segments: readonly string[],
  session: SessionState,
  isComplete: boolean,
  options: ResolveRedirectOptions = {},
): string | null {
  // Zone 0 — hydration. Both the keychain read and the onboarding flag are
  // async, and redirecting before they land is precisely how a returning member
  // sees a frame of `/login` on every cold start.
  if (session.status === 'hydrating') {
    return null;
  }

  const first = segments[0];
  const inAuthGroup = first === AUTH_GROUP;
  const inOnboarding = first === ONBOARDING_ROUTE;

  // Zone 1 — signed out. The auth screens, the join funnel, the intro, and every
  // public / auth-soft route are all reachable. Only a route that genuinely
  // cannot render without a session redirects.
  if (session.status === 'signed-out') {
    if (inAuthGroup || inOnboarding) {
      return null;
    }
    if (policyFor(segments) === 'auth') {
      const next = options.pathname ?? pathFromSegments(segments);
      return `${LOGIN_ROUTE}?next=${encodeURIComponent(next)}`;
    }
    return null;
  }

  // Zone 2 — signed in, first run. Onboarding is the only reachable screen; it
  // is two slides and a Get started, and it must not be escapable by deep
  // link or the app has two possible first experiences.
  //
  // THE JOIN FUNNEL IS THE ONE PLACE THIS BITES, AND IT IS SOLVED AT THE SITE.
  // A signed-out visitor never sees the intro (zone 1 lets them through), so a
  // join buyer always carries `isComplete === false`. The funnel signs the
  // buyer up and THEN charges — so left alone, the moment `signUpMember`
  // resolved this zone would yank them to `/onboarding` **between the signup
  // and the charge**, and the charge would complete invisibly on an unmounted
  // screen. `app/(join)/checkout.tsx` calls `onboarding.complete()` immediately
  // before signup, which is the honest reading: someone who has just walked a
  // four-step purchase has been introduced to the app.
  //
  // Exempting `public` routes here instead was tried and reverted. It buys the
  // funnel nothing the local fix does not, and it costs the invariant on every
  // other public route — a signed-in first-run member standing on `/classes`
  // would simply never see the intro.
  if (!isComplete) {
    return inOnboarding ? null : `/${ONBOARDING_ROUTE}`;
  }

  // Zone 3 — signed in and onboarded. Everything is reachable except the two
  // zones that are now meaningless: the sign-in screens and the intro.
  if (inAuthGroup || inOnboarding) {
    return HOME_ROUTE;
  }
  return null;
}
