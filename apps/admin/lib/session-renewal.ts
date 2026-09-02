import type { Session } from './auth-session';
import type { RefreshedTokens } from './session-refresh';

/** What `GET /api/session` answers, and the cookies it sets when it renewed. */
export interface SessionRenewal {
  user: Session | null;
  /**
   * `true` when there is still a refresh token to try again with: the access
   * token is gone but the operator is not signed out. `false` is a real sign-out.
   */
  recoverable: boolean;
  /** The rotated pair to write back as cookies, when a renewal happened. */
  refreshed: RefreshedTokens | null;
}

/**
 * Resolve the session for `GET /api/session`, renewing it in place when the
 * access token has expired.
 *
 * This used to answer "user: null, recoverable: true" and leave the renewal to
 * the middleware, which only renews on a navigation. The browser hook then had
 * one way to cause a navigation: `window.location.reload()`. With a 15-minute
 * access token, every return to the tab after a pause was a full page reload,
 * sidebar and all. Renewing here means the hook just receives the user, and
 * nothing reloads.
 *
 * `refresh` is single-use on the API (the family is revoked when a token is
 * reused), so a failed renewal is reported as still recoverable rather than as
 * a sign-out: the middleware's own attempt on the next navigation is the
 * authority, and a lost race here must not blank the nav.
 */
export async function renewSession({
  current,
  refreshToken,
  refresh,
  verify,
}: {
  /** The session the access cookie already verifies to, if any. */
  current: Session | null;
  /** The refresh cookie's value, or null when there is none. */
  refreshToken: string | null;
  refresh: (token: string) => Promise<RefreshedTokens | null>;
  verify: (accessToken: string) => Promise<Session | null>;
}): Promise<SessionRenewal> {
  if (current) return { user: current, recoverable: false, refreshed: null };
  if (!refreshToken) return { user: null, recoverable: false, refreshed: null };
  const pair = await refresh(refreshToken);
  const user = pair ? await verify(pair.accessToken) : null;
  if (pair && user) return { user, recoverable: false, refreshed: pair };
  return { user: null, recoverable: true, refreshed: null };
}
