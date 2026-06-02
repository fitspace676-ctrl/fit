// CORS origin policy — allow the configured clients plus every tenant subdomain.
//
// With per-gym subdomains (`<slug>.fit.ge`) the browser Origin varies per tenant,
// so a static allow-list can't enumerate them. This pairs the explicit list
// (WEB_URL / ADMIN_URL / CORS_ORIGINS) with a suffix match against the platform
// root domain: any `https://<anything>.<root>` (and the bare apex) is allowed.

/** Extract the lower-cased hostname from an Origin, or `null` if unparseable. */
function originHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether `origin` is allowed by CORS.
 *
 * - A missing Origin (same-origin navigations, server-to-server, curl) is allowed —
 *   CORS only governs cross-origin browser requests.
 * - An exact match in `allowList` is allowed (the configured web/admin/dev origins).
 * - Otherwise the Origin's host must be the platform root domain or a subdomain of
 *   it (`<slug>.<root>`, including a dev `<slug>.localhost`), so every tenant
 *   subdomain is covered without enumerating them. `rootDomain` may carry a port
 *   (the dev `localhost:3001`); it is stripped before comparison.
 *
 * Pure and framework-free so the policy is unit-testable without booting Nest.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowList: Iterable<string>,
  rootDomain: string | undefined,
): boolean {
  if (!origin) {
    return true;
  }
  for (const allowed of allowList) {
    if (allowed === origin) {
      return true;
    }
  }

  const root = rootDomain?.split(':')[0]?.trim().toLowerCase();
  if (!root) {
    return false;
  }
  const host = originHostname(origin);
  if (!host) {
    return false;
  }
  return host === root || host.endsWith(`.${root}`);
}
