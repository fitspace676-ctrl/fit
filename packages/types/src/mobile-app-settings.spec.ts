import { describe, expect, it } from 'vitest';
import { DEFAULT_MOBILE_APP_FEATURES, resolveMobileAppFeatures } from './mobile-app-settings';

describe('resolveMobileAppFeatures', () => {
  it.each([null, undefined, {}])('defaults legacy empty settings (%j)', (raw) => {
    expect(resolveMobileAppFeatures(raw)).toEqual(DEFAULT_MOBILE_APP_FEATURES);
  });

  it('preserves valid disabled features while defaulting omitted ones', () => {
    expect(resolveMobileAppFeatures({ shop: false, qr: false })).toEqual({
      ...DEFAULT_MOBILE_APP_FEATURES,
      shop: false,
      qr: false,
    });
  });

  it.each([
    false,
    42,
    'invalid',
    [],
    { shop: 'false' },
    { shop: null },
    { shop: false, qr: 0 },
    { unknown: true },
  ])('returns defaults instead of throwing for malformed settings (%j)', (raw) => {
    expect(resolveMobileAppFeatures(raw)).toEqual(DEFAULT_MOBILE_APP_FEATURES);
  });

  it('returns a fresh fallback so callers cannot mutate shared defaults', () => {
    const settings = resolveMobileAppFeatures('invalid');
    settings.shop = false;
    expect(DEFAULT_MOBILE_APP_FEATURES.shop).toBe(true);
  });
});
