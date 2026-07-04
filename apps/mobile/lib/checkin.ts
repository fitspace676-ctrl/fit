// @fit/mobile — the member's gym check-in payload.
//
// The QR shown on the check-in screen (T6.9) encodes a stable, scannable
// identity the gym's front-desk scanner resolves to a member. There is no
// dedicated backend check-in endpoint yet, so the payload is derived purely from
// the session identity: the member id (JWT `sub`) and, when the session is
// scoped to one gym, that gym id. A custom-scheme URI keeps it unambiguous (a
// scanner can tell a Fit check-in apart from an arbitrary URL) and deterministic
// — the same member always renders the same code.

/** The custom URI scheme + host the front-desk scanner recognises. */
const CHECK_IN_SCHEME = 'fitspace://checkin';

/** Identity that backs a member's check-in code. */
export interface CheckInIdentity {
  /** The member id (JWT `sub`). */
  userId: string;
  /** The active gym scope, or `null` for a scopeless session. */
  gymId?: string | null;
  /**
   * An optional freshness token appended as `&t=<nonce>`. The identity the
   * scanner resolves (member + gym) is unchanged by it, so a scanner ignores it;
   * rotating it on a timer just makes the on-screen "refreshes in…" countdown
   * honest — the painted code genuinely changes each window, so a stale
   * screenshot of the pass no longer matches the live one. Omit it for a stable,
   * fully deterministic code.
   */
  nonce?: string | number | null;
}

/**
 * Build the URI encoded into the member's check-in QR, e.g.
 * `fitspace://checkin?member=<userId>&gym=<gymId>`. The `gym` parameter is
 * omitted for a scopeless session, and a `t=<nonce>` freshness token is appended
 * only when one is supplied. Deterministic for a given identity + nonce.
 */
export function buildCheckInPayload({ userId, gymId, nonce }: CheckInIdentity): string {
  const params = [`member=${encodeURIComponent(userId)}`];
  if (gymId) params.push(`gym=${encodeURIComponent(gymId)}`);
  if (nonce != null && nonce !== '') params.push(`t=${encodeURIComponent(String(nonce))}`);
  return `${CHECK_IN_SCHEME}?${params.join('&')}`;
}
