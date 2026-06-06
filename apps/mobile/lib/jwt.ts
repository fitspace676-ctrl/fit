// @fit/mobile — read-only JWT claim decoding.
//
// The app never *verifies* tokens on-device (the API owns that); it only needs
// to read a couple of claims off the already-trusted access token it was issued
// — chiefly the `gymId` that scopes which gym's classes / bookings to show. This
// is a deliberately tiny base64url decoder for the JWT payload segment, with no
// signature check: the token came from our own keychain, so authenticity is not
// in question here, only "which gym is this session scoped to".

/** The subset of access-token claims the client reads. Mirrors the API's `SessionClaims`. */
export interface SessionClaims {
  /** The user id (JWT `sub`). */
  sub?: string;
  /** The active gym scope, or absent/null for a scopeless platform session. */
  gymId?: string | null;
  /** The caller's role within `gymId`. */
  role?: string;
}

/** Decode a base64url string to its UTF-8 text (no padding required on input). */
function decodeBase64Url(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  // Hermes / Expo expose the standard `atob`; the payload is ASCII JSON.
  return atob(padded);
}

/**
 * Decode (without verifying) the payload of a JWT and return its claims, or
 * `null` when the token is malformed. Used to read the session's `gymId` off the
 * stored access token so reads scoped to one tenant (classes, bookings) know
 * which gym to ask for.
 */
export function decodeSessionClaims(accessToken: string | undefined | null): SessionClaims | null {
  if (!accessToken) return null;
  const segments = accessToken.split('.');
  if (segments.length < 2 || !segments[1]) return null;
  try {
    return JSON.parse(decodeBase64Url(segments[1])) as SessionClaims;
  } catch {
    return null;
  }
}
