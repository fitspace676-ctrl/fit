import { describe, it, expect } from 'vitest';
import { DEFAULT_MOBILE_APP_FEATURES, MOBILE_APP_FEATURES } from '@fit/types';
import { appPathVisible } from './app-feature-policy';

describe('app feature routes', () => {
  it.each([
    ['classes', '/classes/occurrence'],
    ['shop', '/shop/product/one'],
    ['shop', '/shop/order/one'],
    ['qr', '/qr'],
    ['services', '/services/one'],
    ['trainers', '/trainers'],
    ['membership', '/membership'],
    ['membership', '/profile/membership'],
    ['membership', '/checkout'],
    ['billing', '/checkout'],
    ['billing', '/profile/billing'],
    ['bookings', '/profile/bookings'],
    ['activity', '/profile/activity'],
    ['goals', '/profile/goals'],
    ['notifications', '/profile/notifications'],
    ['notifications', '/profile/notification-settings'],
  ] as const)('hides %s at %s, including direct links', (feature, path) => {
    expect(appPathVisible(path, DEFAULT_MOBILE_APP_FEATURES)).toBe(true);
    expect(
      appPathVisible(path + '?next=/home', { ...DEFAULT_MOBILE_APP_FEATURES, [feature]: false }),
    ).toBe(false);
  });
  it('keeps home, account and auth reachable with every optional feature disabled', () => {
    const features = { ...DEFAULT_MOBILE_APP_FEATURES };
    for (const key of MOBILE_APP_FEATURES) features[key] = false;
    for (const path of ['/home', '/profile', '/profile/edit', '/login', '/onboarding'])
      expect(appPathVisible(path, features)).toBe(true);
    expect(appPathVisible('/(tabs)/classes', features)).toBe(false);
  });
});
