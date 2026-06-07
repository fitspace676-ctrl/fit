// @fit/mobile — the signed-in member's profile, read off the session token.
//
// The member app has no `GET /me` endpoint yet, and the API's access token
// carries only `{ sub, type, iat, exp, iss }` — no name or email. So the
// "profile" the Settings screen can show is exactly the identity baked into the
// session: the user id, the role (defaulting to MEMBER, mirroring the API's
// tenant middleware), and the active gym scope. This surfaces it reactively off
// `useAuth`, so a re-scoped or ended session repaints consumers with no extra
// plumbing.

import { useMemo } from 'react';
import { decodeSessionClaims } from '../lib/jwt';
import { useAuth } from './useAuth';

/** The profile fields derivable from the session's access token. */
export interface SessionProfile {
  /** The user id (JWT `sub`), or `null` when signed out / still hydrating. */
  userId: string | null;
  /** The caller's role within the active gym (defaults to `MEMBER`). */
  role: string;
  /** The active gym id, or `null` for a scopeless session. */
  gymId: string | null;
}

/** The signed-in member's profile derived from the session access token. */
export function useSessionProfile(): SessionProfile {
  const { session } = useAuth();
  return useMemo(() => {
    const claims = decodeSessionClaims(session?.accessToken);
    return {
      userId: claims?.sub ?? null,
      role: claims?.role ?? 'MEMBER',
      gymId: claims?.gymId ?? null,
    };
  }, [session?.accessToken]);
}
