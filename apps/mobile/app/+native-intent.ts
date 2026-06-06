// Deep-link rewriting for incoming `fit://` URLs (Expo Router NativeIntent).
//
// `fit://classes/:instanceId` already matches the file route
// `(tabs)/classes/[instanceId]` one-to-one, so it needs no rewrite. Orders,
// notifications, and the auth e-mail links, however, are surfaced under routes
// whose paths differ from their public/notification link shape — we translate
// those here:
//
//   fit://orders/:orderId      → /shop/order/:orderId   (Shop tab stack)
//   fit://notifications/:id    → /profile/notifications (Profile tab stack)
//   fit://auth/verify?token=…  → /verify?token=…        (email verification)
//   fit://auth/reset?token=…   → /reset-password?token=… (password reset)
//   fit://auth/forgot?token=…  → /reset-password?token=… (alias of reset)
//
// Per Expo's contract this must never throw (a thrown error can crash launch),
// so every path falls back to itself on any parsing problem.

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // Normalise: drop the scheme/host and any leading slashes, then split the
    // query off so we can route on the path while still forwarding the token.
    const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
    const [rawPath = '', query = ''] = withoutScheme.replace(/^\/+/, '').split('?');
    const [segment, ...rest] = rawPath.split('/');
    const search = query ? `?${query}` : '';

    if (segment === 'orders' && rest[0]) {
      return `/shop/order/${rest[0]}`;
    }
    if (segment === 'notifications') {
      return '/profile/notifications';
    }
    if (segment === 'auth') {
      // The emailed links carry a single-use token in the query, which the
      // (auth) screens read via `useLocalSearchParams` — preserve it verbatim.
      if (rest[0] === 'verify') return `/verify${search}`;
      if (rest[0] === 'reset' || rest[0] === 'forgot') return `/reset-password${search}`;
    }
    return path;
  } catch {
    return path;
  }
}
