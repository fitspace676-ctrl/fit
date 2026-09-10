import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SessionState } from './auth/session';
import {
  AUTH_GROUP,
  DEFAULT_POLICY,
  HOME_ROUTE,
  LOGIN_ROUTE,
  ONBOARDING_ROUTE,
  ROUTE_POLICY,
  pathFromSegments,
  policyFor,
  resolveRedirect,
  type RoutePolicy,
} from './route-policy';

const HYDRATING: SessionState = {
  status: 'hydrating',
  userId: null,
  gymId: null,
  role: null,
  expiresAt: null,
};

const SIGNED_OUT: SessionState = {
  status: 'signed-out',
  userId: null,
  gymId: null,
  role: null,
  expiresAt: null,
};

const SIGNED_IN: SessionState = {
  status: 'signed-in',
  userId: 'user_1',
  gymId: 'gym_a',
  role: 'MEMBER',
  expiresAt: 4_000_000_000_000,
};

/** Signed in, but with no active gym membership — a real, reachable state. */
const SIGNED_IN_NO_MEMBERSHIP: SessionState = { ...SIGNED_IN, gymId: null, role: null };

/** Every route shape the app has, one per policy and per zone. */
const ROUTES = {
  index: [] as string[],
  login: [AUTH_GROUP, 'login'],
  register: [AUTH_GROUP, 'register'],
  onboarding: [ONBOARDING_ROUTE],
  joinCheckout: ['(join)', 'checkout'],
  joinSuccess: ['(join)', 'checkout', 'success'],
  classesTab: ['(tabs)', 'classes'],
  classDetail: ['(tabs)', 'classes', '[id]'],
  shopTab: ['(tabs)', 'shop'],
  // `app/(tabs)/shop/product/[id].tsx` and `app/(tabs)/shop/order/[orderId].tsx`
  // — the segment lists expo-router actually reports, not the shapes the table
  // used to guess at.
  shopProduct: ['(tabs)', 'shop', 'product', '[id]'],
  shopOrder: ['(tabs)', 'shop', 'order', '[orderId]'],
  trainers: ['trainers'],
  services: ['services'],
  serviceDetail: ['services', '[id]'],
  slots: ['slots', '[serviceId]'],
  products: ['products'],
  locations: ['locations'],
  packages: ['packages'],
  catalogue: ['catalogue'],
  cart: ['cart'],
  homeTab: ['(tabs)', 'home'],
  profileTab: ['(tabs)', 'profile'],
  bookings: ['bookings'],
  membership: ['membership'],
  billing: ['billing'],
  goals: ['goals'],
  notifications: ['notifications'],
  settings: ['settings'],
  order: ['order', '[id]'],
  // `app/qr.tsx` — a ROOT route, not a tab: it is a modal over whichever tab
  // opened it, so expo-router reports it as a single bare segment.
  qr: ['qr'],
  unknown: ['some', 'route', 'nobody', 'declared'],
} as const;

describe('ROUTE_POLICY / policyFor', () => {
  it('reads the policy for the whole tree by longest-prefix match', () => {
    const expected: Record<string, RoutePolicy> = {
      index: 'public',
      joinCheckout: 'public',
      joinSuccess: 'public',
      classesTab: 'public',
      classDetail: 'auth-soft',
      shopTab: 'public',
      // Public to browse. The key must name the REAL route: the table once said
      // `'(tabs)/shop/[id]'`, which matched nothing at all.
      shopProduct: 'public',
      // Under the public shop tab, and `policyFor` matches by longest prefix —
      // so without its own entry the order screen inherited `'public'` from
      // `'(tabs)/shop'` and the flat `order: 'auth'` row below never applied.
      shopOrder: 'auth',
      trainers: 'public',
      services: 'public',
      serviceDetail: 'auth-soft',
      slots: 'auth-soft',
      products: 'public',
      locations: 'public',
      packages: 'public',
      catalogue: 'public',
      cart: 'auth-soft',
      homeTab: 'auth',
      profileTab: 'auth',
      bookings: 'auth',
      membership: 'auth',
      billing: 'auth',
      goals: 'auth',
      notifications: 'auth',
      settings: 'auth',
      order: 'auth',
      qr: 'auth',
    };
    for (const [name, policy] of Object.entries(expected)) {
      expect(policyFor(ROUTES[name as keyof typeof ROUTES]), name).toBe(policy);
    }
  });

  it('a detail route may be stricter than the list it sits under', () => {
    expect(policyFor(['services'])).toBe('public');
    expect(policyFor(['services', '[id]'])).toBe('auth-soft');
    // …and deeper still inherits the nearest declared ancestor.
    expect(policyFor(['services', '[id]', 'book'])).toBe('auth-soft');
  });

  it('fails CLOSED: an undeclared route is auth, not public', () => {
    // The old guard's default was "public route, therefore /login"; this one's
    // default is "protected", so forgetting to declare a new member screen shows
    // a sign-in prompt rather than leaking member data.
    expect(DEFAULT_POLICY).toBe('auth');
    expect(policyFor(ROUTES.unknown)).toBe('auth');
    expect(policyFor(['(tabs)'])).toBe('auth');
  });

  it('does not let the index entry become the table-wide default', () => {
    // `''` is the zero-length prefix of every path. If the prefix walk were
    // allowed to reach it, every undeclared route would inherit `public` and the
    // fail-closed rule above would be silently dead.
    expect(ROUTE_POLICY['']).toBe('public');
    expect(policyFor([])).toBe('public');
    expect(policyFor(['anything'])).toBe('auth');
  });
});

describe('pathFromSegments', () => {
  it('drops route groups, which expo-router strips from hrefs', () => {
    expect(pathFromSegments(['(tabs)', 'profile'])).toBe('/profile');
    expect(pathFromSegments(['(join)', 'checkout', 'success'])).toBe('/checkout/success');
    expect(pathFromSegments([])).toBe('/');
  });
});

describe('resolveRedirect — the full truth table', () => {
  const allRoutes = Object.values(ROUTES);

  it('hydrating: never redirects, anywhere', () => {
    // The launch flash: redirecting before the keychain read lands bounces a
    // perfectly good session through /login on every cold start.
    for (const segments of allRoutes) {
      expect(resolveRedirect(segments, HYDRATING, false), segments.join('/')).toBeNull();
      expect(resolveRedirect(segments, HYDRATING, true), segments.join('/')).toBeNull();
    }
  });

  describe('signed out', () => {
    it('allows the (auth) group', () => {
      expect(resolveRedirect(ROUTES.login, SIGNED_OUT, false)).toBeNull();
      expect(resolveRedirect(ROUTES.register, SIGNED_OUT, true)).toBeNull();
    });

    it('allows onboarding — the intro explains the app, not the account', () => {
      expect(resolveRedirect(ROUTES.onboarding, SIGNED_OUT, false)).toBeNull();
    });

    it('allows the whole join funnel — a signed-out purchase is the point', () => {
      expect(resolveRedirect(ROUTES.joinCheckout, SIGNED_OUT, true)).toBeNull();
      expect(resolveRedirect(ROUTES.joinSuccess, SIGNED_OUT, true)).toBeNull();
    });

    it('allows every public route — the regression the old guard shipped', () => {
      // `if (!session) router.replace('/login')` made all of these unreachable,
      // and every one of them is `@Public()` on the API and rendered signed-out
      // by the web portal.
      const publicRoutes = [
        ROUTES.index,
        ROUTES.classesTab,
        ROUTES.shopTab,
        ROUTES.shopProduct,
        ROUTES.trainers,
        ROUTES.services,
        ROUTES.products,
        ROUTES.locations,
        ROUTES.packages,
        ROUTES.catalogue,
      ];
      for (const segments of publicRoutes) {
        expect(policyFor(segments), segments.join('/')).toBe('public');
        expect(resolveRedirect(segments, SIGNED_OUT, true), segments.join('/')).toBeNull();
      }
    });

    it('allows every auth-soft route — the screen renders, the CTA prompts', () => {
      for (const segments of [
        ROUTES.classDetail,
        ROUTES.serviceDetail,
        ROUTES.slots,
        ROUTES.cart,
      ]) {
        expect(policyFor(segments), segments.join('/')).toBe('auth-soft');
        expect(resolveRedirect(segments, SIGNED_OUT, true), segments.join('/')).toBeNull();
      }
    });

    it('redirects an auth route to /login carrying next=', () => {
      for (const segments of [
        ROUTES.homeTab,
        ROUTES.profileTab,
        ROUTES.bookings,
        ROUTES.membership,
        ROUTES.billing,
        ROUTES.goals,
        ROUTES.notifications,
        ROUTES.settings,
        ROUTES.order,
        // Nested under the PUBLIC shop tab, so this is the one that longest-
        // prefix matching used to get wrong: without `'(tabs)/shop/order'` the
        // order screen inherited `public` and no redirect ever fired.
        ROUTES.shopOrder,
        // The scanner. Only reachable from the capsule inside the signed-in
        // shell, so a signed-out arrival is a deep link — sign in, then come
        // back through `next=` rather than meeting a camera that has nothing
        // to identify.
        ROUTES.qr,
        ROUTES.unknown,
      ]) {
        const target = resolveRedirect(segments, SIGNED_OUT, true);
        expect(target, segments.join('/')).toBe(
          `${LOGIN_ROUTE}?next=${encodeURIComponent(pathFromSegments(segments))}`,
        );
      }
    });

    it('percent-encodes next= so the path survives the query string', () => {
      expect(resolveRedirect(ROUTES.bookings, SIGNED_OUT, true)).toBe('/login?next=%2Fbookings');
    });

    it('prefers a supplied pathname, because useSegments() reports "[id]" not the id', () => {
      expect(
        resolveRedirect(['order', '[id]'], SIGNED_OUT, true, { pathname: '/order/ord_42' }),
      ).toBe(`${LOGIN_ROUTE}?next=${encodeURIComponent('/order/ord_42')}`);
    });
  });

  describe('signed in, not onboarded', () => {
    it('stays on onboarding', () => {
      expect(resolveRedirect(ROUTES.onboarding, SIGNED_IN, false)).toBeNull();
    });

    it('sends every other route to /onboarding, public ones included', () => {
      for (const segments of allRoutes) {
        if (segments[0] === ONBOARDING_ROUTE) {
          continue;
        }
        expect(resolveRedirect(segments, SIGNED_IN, false), segments.join('/')).toBe(
          `/${ONBOARDING_ROUTE}`,
        );
      }
    });
  });

  describe('signed in and onboarded', () => {
    it('sends the (auth) group and onboarding to home', () => {
      expect(resolveRedirect(ROUTES.login, SIGNED_IN, true)).toBe(HOME_ROUTE);
      expect(resolveRedirect(ROUTES.register, SIGNED_IN, true)).toBe(HOME_ROUTE);
      expect(resolveRedirect(ROUTES.onboarding, SIGNED_IN, true)).toBe(HOME_ROUTE);
    });

    it('allows everything else, public and protected alike', () => {
      for (const segments of allRoutes) {
        if (segments[0] === AUTH_GROUP || segments[0] === ONBOARDING_ROUTE) {
          continue;
        }
        expect(resolveRedirect(segments, SIGNED_IN, true), segments.join('/')).toBeNull();
      }
    });
  });

  it('never redirects because of a missing membership', () => {
    // Routing is identity, not entitlement. A signed-in user with no `gymId`
    // claim must reach exactly the same routes as one with a membership;
    // membership-gated CTAs render their own "no plan" state in place.
    for (const segments of allRoutes) {
      for (const isComplete of [false, true]) {
        expect(
          resolveRedirect(segments, SIGNED_IN_NO_MEMBERSHIP, isComplete),
          `${segments.join('/')} / onboarded=${String(isComplete)}`,
        ).toBe(resolveRedirect(segments, SIGNED_IN, isComplete));
      }
    }
  });
});

describe('the §5 test boundary', () => {
  it('imports no react-native — the guard must stay in the fast suite', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./route-policy.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+'react-native/);
    expect(source).not.toMatch(/from\s+'expo-router'/);
  });
});
