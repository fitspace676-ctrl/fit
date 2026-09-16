import { describe, expect, it } from 'vitest';
import appJson from '../app.json';
import { redirectSystemPath } from './+native-intent';

/** The launch-path contract: one argument shape, and `initial` never matters. */
const rewrite = (path: string, initial = true): string => redirectSystemPath({ path, initial });

describe('redirectSystemPath — custom scheme', () => {
  it('rewrites an order link to the Shop stack', () => {
    expect(rewrite('fit://orders/ord_123')).toBe('/shop/order/ord_123');
  });

  it('leaves a bare orders link alone rather than routing to /shop/order/', () => {
    expect(rewrite('fit://orders')).toBe('/orders');
  });

  it('rewrites any notification link to the inbox', () => {
    expect(rewrite('fit://notifications')).toBe('/profile/notifications');
    expect(rewrite('fit://notifications/ntf_9')).toBe('/profile/notifications');
  });

  it('rewrites the emailed verification link and keeps the token verbatim', () => {
    expect(rewrite('fit://auth/verify?token=abc.DEF-123_x')).toBe('/verify?token=abc.DEF-123_x');
  });

  it('rewrites both password-reset aliases', () => {
    expect(rewrite('fit://auth/reset?token=t1')).toBe('/reset-password?token=t1');
    expect(rewrite('fit://auth/forgot?token=t1')).toBe('/reset-password?token=t1');
  });

  it('does not re-encode a token that already contains reserved characters', () => {
    // Re-encoding `%2F` to `%252F` is how a working email link becomes
    // "this link has expired", with nothing reproducible from inside the app.
    const path = 'fit://auth/reset?token=a%2Fb%2Bc%3D&uid=u_1';
    expect(rewrite(path)).toBe('/reset-password?token=a%2Fb%2Bc%3D&uid=u_1');
  });

  it('routes the tenant-scoped sign-in link and forwards the gym slug', () => {
    expect(rewrite('fit://auth/login?gym=downtown-strength')).toBe('/login?gym=downtown-strength');
  });

  it('answers to the scheme the app actually registers in app.json', () => {
    // The bug this exists to make impossible: the salvaged app built links
    // under `fitspace://` while `app.json` registered `fit://`, so every deep
    // link it ever emitted addressed a scheme no build of it had ever claimed.
    // Driving the parser with `app.json`'s own value is what keeps the module
    // constant and the manifest from disagreeing — an unrecognised scheme is
    // treated as a web host, so its first segment would be eaten and this
    // would return `/`.
    expect(rewrite(`${appJson.expo.scheme}://profile`)).toBe('/profile');
  });

  it('passes the routes that already match their link shape straight through', () => {
    expect(rewrite('fit://classes/cls_1')).toBe('/classes/cls_1');
    expect(rewrite('fit://services/svc_1')).toBe('/services/svc_1');
    expect(rewrite('fit://checkout')).toBe('/checkout');
    expect(rewrite('fit://checkout?plan=p_1')).toBe('/checkout?plan=p_1');
  });

  it('folds a trainer link onto the roster — the profile is a sheet now', () => {
    // `/trainers/:id` was deleted with the screen (2026-09-09). Web still
    // publishes the shape and old emails still carry it, and an unmatched route
    // is the app's 404 — so the id is dropped rather than routed to nothing.
    expect(rewrite('fit://trainers/trn_1')).toBe('/trainers');
    expect(rewrite('fit://trainers')).toBe('/trainers');
    expect(rewrite('https://acme.fit.ge/ka/trainers/trn_1')).toBe('/trainers');
  });

  it('treats the scheme root as the app front door', () => {
    expect(rewrite('fit://')).toBe('/');
  });

  it("keeps the Expo dev client's `exp+fit://` form working", () => {
    // A deep link that works in a release build has to work in development,
    // or the only way to exercise this file is to ship it.
    expect(rewrite('exp+fit://profile')).toBe('/profile');
    expect(rewrite('exp+fit://orders/ord_1')).toBe('/shop/order/ord_1');
  });

  it('keeps the authority as a route segment under the custom scheme', () => {
    // `fit://profile` has no path at all — `profile` is the URL's HOST. A
    // parser that drops the authority the way it must for `https://` deletes
    // the route.
    expect(rewrite('fit://profile')).toBe('/profile');
  });
});

describe('redirectSystemPath — universal links', () => {
  it('drops the host', () => {
    expect(rewrite('https://acme.fit.ge/classes/cls_1')).toBe('/classes/cls_1');
  });

  it('drops the web [locale] segment', () => {
    expect(rewrite('https://acme.fit.ge/ka/classes/cls_1')).toBe('/classes/cls_1');
    expect(rewrite('https://acme.fit.ge/en/classes/cls_1')).toBe('/classes/cls_1');
  });

  it('drops the locale before applying a rewrite, not after', () => {
    expect(rewrite('https://acme.fit.ge/ka/orders/ord_7')).toBe('/shop/order/ord_7');
    expect(rewrite('https://acme.fit.ge/en/notifications')).toBe('/profile/notifications');
    expect(rewrite('https://acme.fit.ge/ka/auth/verify?token=t')).toBe('/verify?token=t');
    expect(rewrite('https://acme.fit.ge/ka/profile')).toBe('/profile');
  });

  it('maps a localised web home to the app front door', () => {
    expect(rewrite('https://acme.fit.ge/ka')).toBe('/');
    expect(rewrite('https://acme.fit.ge/')).toBe('/');
  });

  it('does not mistake a route segment that merely starts with a locale', () => {
    // `enroll` begins with `en`; `isLocale` is an equality check, not a prefix
    // match, and this is the test that keeps it one.
    expect(rewrite('https://acme.fit.ge/enroll')).toBe('/enroll');
    expect(rewrite('https://acme.fit.ge/ka/enroll')).toBe('/enroll');
  });

  it('keeps the query across a universal link', () => {
    expect(rewrite('https://acme.fit.ge/ka/classes?day=2026-08-31')).toBe(
      '/classes?day=2026-08-31',
    );
  });

  it('handles http as well as https', () => {
    expect(rewrite('http://acme.fit.ge/ka/profile')).toBe('/profile');
  });
});

describe('redirectSystemPath — hostile and malformed input', () => {
  // Contract 1: a throw here is a crash on the launch path. Every one of these
  // must return a string, and none may throw.
  const garbage = [
    '',
    '   ',
    '/',
    '///',
    'not a url at all',
    'fit:/',
    'fit://///',
    '://missing-scheme',
    'javascript:alert(1)',
    'fit://orders/',
    'fit://?token=t',
    `fit://${'a/'.repeat(200)}b`,
    'fit://ka',
    'https://',
    'https://acme.fit.ge',
  ];

  for (const path of garbage) {
    it(`never throws on ${JSON.stringify(path)}`, () => {
      expect(() => rewrite(path)).not.toThrow();
      expect(typeof rewrite(path)).toBe('string');
    });
  }

  it('returns non-string input untouched instead of throwing', () => {
    // The OS hands over an Intent, not a guaranteed URL. `path` is typed
    // `string`, and the type is a promise the platform does not make.
    const hostile = [null, undefined, 42, {}] as unknown as string[];
    for (const value of hostile) {
      expect(() => redirectSystemPath({ path: value, initial: true })).not.toThrow();
    }
  });

  it('returns blank input unchanged so the router reports it unmatched', () => {
    expect(rewrite('')).toBe('');
    expect(rewrite('   ')).toBe('   ');
  });

  it('ignores `initial`', () => {
    expect(rewrite('fit://profile', true)).toBe(rewrite('fit://profile', false));
  });
});
