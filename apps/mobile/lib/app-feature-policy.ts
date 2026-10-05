import type { MobileAppFeature, MobileAppFeatures } from '@fit/types';

/** URLs, including deep links and banner targets, share one feature policy. */
export function appFeaturesForPath(path: string): MobileAppFeature[] {
  const parts = path
    .split('?')[0]!
    .split('/')
    .filter((part) => part && !part.startsWith('('));
  const [head, child] = parts;
  if (head === 'checkout' || head === 'checkout-success') return ['membership', 'billing'];
  if (head === 'shop') return ['shop'];
  if (head === 'profile') {
    if (child === 'notification-settings' || child === 'notifications') return ['notifications'];
    if (
      child === 'membership' ||
      child === 'billing' ||
      child === 'bookings' ||
      child === 'activity' ||
      child === 'goals'
    )
      return [child];
    return [];
  }
  if (
    head === 'classes' ||
    head === 'qr' ||
    head === 'services' ||
    head === 'trainers' ||
    head === 'membership'
  )
    return [head];
  return [];
}
export function appPathVisible(path: string, features: MobileAppFeatures): boolean {
  return appFeaturesForPath(path).every((key) => features[key]);
}
