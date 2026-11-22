/**
 * The account realm: which separate set of accounts a `users` row belongs to.
 *
 * Every user row lives in exactly one realm, and an e-mail address is unique only
 * inside a realm (`@@unique([email, realm])`):
 *
 *   • `platform`: a super-admin, or a bare account that belongs to no gym.
 *   • `<gymId>:staff`: one gym's staff account (owner, manager, receptionist,
 *     trainer). Signs in to that gym's admin console only.
 *   • `<gymId>:member`: one gym's member account (a customer). Signs in to that
 *     gym's member portal and the mobile app only.
 *
 * A gym-realm user holds exactly one `GymMember` row, in its own gym, whose role is
 * `MEMBER` exactly when the realm is a member realm. So the same address may hold a
 * staff account and a member account in one gym (two rows, two passwords, two
 * sessions) and unrelated accounts at other gyms.
 *
 * This module is the ONLY place the realm string is built or read: the API, the
 * CLI and the seed all go through it, so the format can never drift between them.
 * It has no dependency on the generated client, so the seed and the CLI can import
 * it as freely as the API does.
 */

/** Which of a gym's two account sets: mirrors `accountAudienceSchema` in `@fit/types`. */
export type AccountAudience = 'staff' | 'member';

/** The realm of a super-admin or of an account that belongs to no gym. */
export const PLATFORM_REALM = 'platform';

/** The realm of one gym's staff accounts or member accounts. */
export function gymRealm(gymId: string, audience: AccountAudience): string {
  if (!gymId || gymId.includes(':')) {
    throw new Error('A gym realm needs a plain gym id');
  }
  return `${gymId}:${audience}`;
}

/**
 * The account set a gym role belongs to: `MEMBER` is a member account, every other
 * gym role (OWNER, MANAGER, RECEPTIONIST, TRAINER) a staff account. `SUPER_ADMIN`
 * is not a gym role and has no gym realm; asking for one is a programming error.
 */
export function audienceOfRole(role: string): AccountAudience {
  if (role === 'SUPER_ADMIN') {
    throw new Error('SUPER_ADMIN is a platform role and has no gym realm');
  }
  return role === 'MEMBER' ? 'member' : 'staff';
}

/** The realm of the account that holds `role` in `gymId`. */
export function realmForRole(gymId: string, role: string): string {
  return gymRealm(gymId, audienceOfRole(role));
}

/** A realm read back into its parts. */
export type ParsedRealm =
  | { kind: 'platform' }
  | { kind: 'gym'; gymId: string; audience: AccountAudience };

/** Read a stored realm; `null` for a value this module did not write. */
export function parseRealm(realm: string): ParsedRealm | null {
  if (realm === PLATFORM_REALM) {
    return { kind: 'platform' };
  }
  const separator = realm.lastIndexOf(':');
  if (separator <= 0) {
    return null;
  }
  const gymId = realm.slice(0, separator);
  const audience = realm.slice(separator + 1);
  if (audience !== 'staff' && audience !== 'member') {
    return null;
  }
  return { kind: 'gym', gymId, audience };
}
