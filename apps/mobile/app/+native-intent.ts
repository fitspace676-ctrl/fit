// Deep-link rewriting for incoming links (Expo Router's NativeIntent hook).
//
// ===========================================================================
// TWO CONTRACTS, AND BOTH ARE LOAD-BEARING.
//
//   1. THIS FUNCTION MUST NEVER THROW. Expo calls it on the launch path with
//      whatever the OS handed the app — which is not necessarily a URL, and on
//      Android is whatever any other app chose to put in an Intent. A throw
//      here is a crash on launch from a link, i.e. exactly the moment the user
//      is least able to work around it. Every branch is inside one `try`, and
//      the fallback is always "return the path unchanged and let the router
//      decide it is unmatched".
//
//   2. THE QUERY SURVIVES VERBATIM. `fit://auth/verify?token=…` and
//      `fit://auth/reset?token=…` carry single-use tokens the API minted; the
//      `(auth)` screens read them with `useLocalSearchParams`. Re-encoding,
//      re-ordering or dropping a parameter turns a working email link into
//      "this link has expired", which is unreproducible from the app.
//
// TWO LINK SHAPES REACH THIS FUNCTION.
//
//   fit://<path>                  the custom scheme (`app.json` → expo.scheme,
//                                 mirrored here as `APP_SCHEME`)
//   https://<slug>.fit.ge/<path>  the universal / app link, i.e. the WEB URL
//
// They differ in two ways and both are handled below: the web URL has a HOST
// that is not part of the route, and the web routes carry a `[locale]` segment
// (`/ka/classes/…`) that has no counterpart in the app. Dropping the locale is
// the single most likely bug in this file — `/ka/classes/abc` routed verbatim
// is an unmatched route, and the user lands on a 404 screen from a link that
// works in a browser — so it has its own tests.
// ===========================================================================

import { isLocale } from '@fit/i18n';

/**
 * The custom URI scheme this app registers, exactly as `app.json`'s
 * `expo.scheme` declares it.
 *
 * The bug this constant exists to make impossible: the salvaged app wrote
 * `fitspace://` in its check-in module while `app.json` registered `fit://`,
 * so every deep link it ever built addressed a scheme no build of it had ever
 * claimed. It used to live in `lib/checkin.ts`, which was removed with the QR
 * screen (2026-08-31); `+native-intent.spec.ts` now drives this file with the
 * scheme read straight out of `app.json`, so a mismatch fails the spec rather
 * than the launch path.
 */
const APP_SCHEME = 'fit';

/** `scheme://` — captured so we can tell a web host from a custom-scheme path. */
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;

/**
 * Is this scheme one of OURS — i.e. one whose authority is the first path
 * element rather than a domain?
 *
 * `fit://profile` has no path at all: `profile` is the URL's host.
 * `https://acme.fit.ge/profile` has the same route under a real host. Getting
 * this asymmetry wrong in either direction either deletes every custom-scheme
 * route or leaves the domain in front of every universal-link one.
 *
 * `exp+fit://` is the form an Expo dev client registers, so a deep link that
 * works in a release build works in development too. Both are derived from
 * {@link APP_SCHEME}.
 */
function isAppScheme(scheme: string): boolean {
  return scheme === APP_SCHEME || scheme === `exp+${APP_SCHEME}`;
}

/** A parsed incoming link: route segments plus the query, still encoded. */
interface ParsedLink {
  readonly segments: readonly string[];
  /** `?token=…`, or `''`. Never touched — see contract 2. */
  readonly search: string;
}

/**
 * Split an incoming link into route segments and its query.
 *
 * `fit://orders/o_1?x=1`          → `{ segments: ['orders','o_1'], search: '?x=1' }`
 * `https://acme.fit.ge/ka/profile` → `{ segments: ['profile'],      search: '' }`
 *
 * The authority is dropped only for `http(s)`, where it is a domain. Under the
 * custom scheme the authority IS the first path element — `fit://profile` has
 * no path at all, only a host of `profile` — so dropping it there would delete
 * the route. This is the asymmetry every hand-rolled version of this function
 * gets wrong in one direction or the other.
 */
function parseLink(path: string): ParsedLink {
  const match = SCHEME.exec(path);
  const scheme = match?.[1]?.toLowerCase();
  const rest = match ? path.slice(match[0].length) : path;

  const queryAt = rest.indexOf('?');
  const rawPath = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const search = queryAt === -1 ? '' : rest.slice(queryAt);

  let segments = rawPath.split('/').filter((segment) => segment.length > 0);

  // A web URL's authority is its domain, not a route. Under our own scheme it
  // IS the route's first element — see `isAppScheme`.
  if (scheme !== undefined && !isAppScheme(scheme)) {
    segments = segments.slice(1);
  }

  // THE `[locale]` SEGMENT. `apps/web` routes every page under `/[locale]/…`,
  // so every shareable URL a member can copy out of a browser starts `/ka/` or
  // `/en/`. The app has one locale at a time, chosen in Settings, and no route
  // segment for it. `isLocale` comes from `@fit/i18n` rather than a literal
  // list here so adding a third locale cannot leave this file behind.
  const first = segments[0];
  if (first !== undefined && isLocale(first)) {
    segments = segments.slice(1);
  }

  return { segments, search };
}

/** `/a/b` from `['a','b']`, or `/` from `[]`. */
function href(segments: readonly string[], search = ''): string {
  return `/${segments.join('/')}${search}`;
}

/**
 * Rewrite an incoming deep link to an in-app route.
 *
 * Only the links whose PUBLIC shape differs from their ROUTE shape are
 * rewritten; everything else is normalised (scheme, host and locale removed)
 * and handed to the router as-is, which is what makes `fit://classes/:id`,
 * `fit://services/:id` and `fit://checkout` work without an entry apiece.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (typeof path !== 'string' || path.trim().length === 0) {
      return path;
    }

    const { segments, search } = parseLink(path);
    const [head, ...rest] = segments;

    // A bare `fit://` or `https://acme.fit.ge/ka` — the app's own front door.
    if (head === undefined) {
      return '/';
    }

    // ── The one route whose app path differs from its link path ────────────
    //
    // `fit://orders/:id` is what the order-confirmation email and the push
    // notification send; the screen lives in the Shop stack.
    //
    // WHAT THAT SCREEN MUST CALL: `GET /checkout/:orderId`. NOT `/orders/:id`
    // — that is `apps/api/src/orders/orders.controller.ts`, the staff console's
    // order surface, gated on `BillingRead`, which the `MEMBER` role does not
    // hold. The deleted app derived the endpoint from the path and shipped a
    // shop checkout that returned 403 for every member who ever completed one.
    // The route name below says `order`; the endpoint does not follow from it.
    if (head === 'orders' && rest[0] !== undefined) {
      return `/shop/order/${rest[0]}`;
    }

    // The inbox is one screen; a notification link naming a single id still
    // opens it, because there is no per-notification route.
    if (head === 'notifications') {
      return '/profile/notifications';
    }

    // `fit://trainers/:id` — the shape web publishes and old emails still
    // carry. The app has no route with that shape any more: the profile is the
    // sheet in `components/classes/trainer-sheet.tsx`, opened from the roster.
    // An unmatched route is the app's 404 screen, so the id is dropped and the
    // link lands on the roster the member can find the coach in. `search` is
    // dropped with it — nothing under `trainers` carries a token, and the
    // roster reads no query.
    if (head === 'trainers') {
      return '/trainers';
    }

    if (head === 'auth') {
      // The emailed links carry a single-use token — forwarded untouched.
      if (rest[0] === 'verify') return `/verify${search}`;
      if (rest[0] === 'reset' || rest[0] === 'forgot') return `/reset-password${search}`;
      // `fit://auth/login?gym=<slug>` — the tenant-scoped sign-in link. The
      // slug feeds `resolveGymSlug({ deepLinkSlug })` (D4), which is the only
      // way a build can be pointed at a gym other than `EXPO_PUBLIC_GYM_SLUG`.
      // The API treats `gymSlug` as context rather than a credential and
      // silently ignores an unknown one, so the login screen is where the
      // "asked for X, got Y" mismatch is detected — not here.
      if (rest[0] === 'login') return `/login${search}`;
      // Anything else under `auth` is the sign-in stack's own path.
      return href(rest, search);
    }

    // `fit://shop/:productId` — a product shared or linked from a campaign.
    //
    // This one is NOT already the route it names. The screen is
    // `app/(tabs)/shop/product/[id].tsx`, so the bare `shop/:id` form has to
    // gain the `product` segment or it lands on a route that does not exist.
    // Bare `fit://shop` (no id) is the catalogue and passes through below.
    if (head === 'shop' && rest[0] !== undefined && rest[0] !== 'cart' && rest[0] !== 'order') {
      return rest[0] === 'product' ? href(segments, search) : `/shop/product/${rest[0]}`;
    }

    // Everything else — `classes/:id`, `services/:id`, `checkout`, `shop`,
    // `home` — is already the route it names. It still
    // goes through here rather than being returned untouched, because the
    // universal-link form needed its host and its locale removed.
    return href(segments, search);
  } catch {
    // Contract 1. Whatever went wrong, the app still launches.
    return path;
  }
}
