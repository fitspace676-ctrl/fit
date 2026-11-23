import {
  PLATFORM_REALM,
  audienceOfRole,
  gymRealm,
  parseRealm,
  realmForRole,
  type AccountAudience,
  type ParsedRealm,
} from '@fit/db';

/**
 * The API's door to account realms (which separate set of accounts a `users` row
 * belongs to). The format itself lives in `@fit/db` (`prisma/account-realm.ts`)
 * so the CLI and the seed share it; everything in the API imports it from here.
 *
 *   • `platform`: a super-admin, or a bare account with no gym.
 *   • `<gymId>:staff`: one gym's staff account (admin console).
 *   • `<gymId>:member`: one gym's member account (member portal, mobile app).
 *
 * An address is unique per realm, so every look-up of a user by e-mail names the
 * realm: `{ email_realm: { email, realm } }`.
 */
export {
  PLATFORM_REALM,
  audienceOfRole,
  gymRealm,
  parseRealm,
  realmForRole,
  type AccountAudience,
  type ParsedRealm,
};

/** The member-account realm of a gym. */
export function memberRealm(gymId: string): string {
  return gymRealm(gymId, 'member');
}

/** The staff-account realm of a gym. */
export function staffRealm(gymId: string): string {
  return gymRealm(gymId, 'staff');
}

/**
 * The gym realms a sign-in on `gymId` looks in, in the order they are tried. A
 * client that names its audience gets exactly that set of accounts; one that does
 * not (a build from before the split) is matched against the member account first
 * and the staff account second.
 */
export function signInRealms(gymId: string, audience: AccountAudience | undefined): string[] {
  return audience ? [gymRealm(gymId, audience)] : [memberRealm(gymId), staffRealm(gymId)];
}

/** Whether a realm is one of the audiences a tenant-less sign-in may land on. */
export function audienceAllows(
  realm: ParsedRealm | null,
  audience: AccountAudience | undefined,
): realm is { kind: 'gym'; gymId: string; audience: AccountAudience } {
  return realm?.kind === 'gym' && (audience === undefined || realm.audience === audience);
}
