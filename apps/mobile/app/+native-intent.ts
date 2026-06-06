// Deep-link rewriting for incoming `fit://` URLs (Expo Router NativeIntent).
//
// `fit://classes/:instanceId` already matches the file route
// `(tabs)/classes/[instanceId]` one-to-one, so it needs no rewrite. Orders and
// notifications, however, are surfaced under nested tab stacks whose paths
// differ from their public/notification link shape — we translate those here:
//
//   fit://orders/:orderId      → /shop/order/:orderId   (Shop tab stack)
//   fit://notifications/:id    → /profile/notifications (Profile tab stack)
//
// Per Expo's contract this must never throw (a thrown error can crash launch),
// so every path falls back to itself on any parsing problem.

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Normalise: drop the scheme/host and any leading slashes so we can split
    // on the pathname segments regardless of how the URL arrived.
    const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const pathname = withoutScheme.replace(/^\/+/, '').split('?')[0] ?? '';
    const [segment, ...rest] = pathname.split('/');

    if (segment === 'orders' && rest[0]) {
      return `/shop/order/${rest[0]}`;
    }
    if (segment === 'notifications') {
      return '/profile/notifications';
    }
    return path;
  } catch {
    return path;
  }
}
