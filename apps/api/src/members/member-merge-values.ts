import type { GymLanguage, MergeValues } from '@fit/types';
import { money } from '../common/money';

/** Milliseconds in a day, for the days-until-expiry count. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The member columns a merge-field expansion reads. */
export interface MemberMergeSource {
  status: string;
  joinedAt: Date;
  dateOfBirth: Date | null;
  user: { name: string | null; email: string; phone: string | null };
  subscriptions: {
    currentPeriodEnd: Date | null;
    plan: { name: string; priceAmount: number; currency: string } | null;
  }[];
  /**
   * Prisma's relation count, shaped exactly as `_count: { select: { checkIns:
   * true } }` returns it — the same select `AutomationMergeService` carries, so
   * both resolvers count check-ins the one way.
   */
  _count: { checkIns: number };
}

/** `YYYY-MM-DD`, or an empty string for a null date. */
function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

/**
 * Every merge value a marketing or automation message can expand, for one member.
 *
 * A free function rather than a service method so the catalogue's "every offered
 * field must be fillable" rule can be checked in a unit test without standing up
 * Nest and Prisma. That test is the whole reason this file exists.
 *
 * EVERY offered token gets a key, even when the underlying datum is missing — an
 * absent key falls through to `interpolateMergeFields`'s blanking pass, which is
 * indistinguishable from the bug this change fixes. A member with no subscription
 * gets `plan_name: ''`, deliberately, not `plan_name: undefined`.
 */
export function buildMemberMergeValues(input: {
  member: MemberMergeSource;
  gymName: string;
  business: { phone: string; email: string; address: string; website: string };
  /** The gym's interface language — what `{{payment_amount}}` is formatted in. */
  language: GymLanguage;
  /**
   * The member's live loyalty balance — the `balanceAfter` of the newest ledger
   * entry, or `0` for a member who has never earned any. Passed in rather than
   * queried here so this builder stays pure and its catalogue test can run
   * without Nest or Prisma; the caller (`MembersService.sendMemberEmail`) reads
   * it exactly as `AutomationMergeService.pointsBalance` does.
   */
  pointsBalance: number;
  today: Date;
}): MergeValues {
  const { member, gymName, business, language, pointsBalance, today } = input;

  const fullName = (member.user.name ?? '').trim();
  const [firstName, ...rest] = fullName.length > 0 ? fullName.split(/\s+/) : [''];
  const first = firstName ?? '';
  const last = rest.join(' ');
  const phone = member.user.phone ?? '';

  const sub = member.subscriptions[0];
  const planName = sub?.plan?.name ?? '';
  const expiry = sub?.currentPeriodEnd ?? null;
  const price = sub?.plan?.priceAmount;
  const currency = sub?.plan?.currency ?? '';

  // Floor, so "1 day left" holds for the whole of the day before expiry rather
  // than rounding up to 2 in the morning and down to 0 after lunch. Matches
  // `AutomationMergeService.mergeValues`, which counts the same days for the same
  // member — the two must not disagree by one.
  const daysLeft = expiry
    ? String(Math.max(0, Math.floor((expiry.getTime() - today.getTime()) / DAY_MS)))
    : '';

  const values: MergeValues = {
    // -- Marketing vocabulary --
    first_name: first,
    last_name: last,
    full_name: fullName,
    email: member.user.email,
    phone,
    join_date: isoDate(member.joinedAt),
    birthday: isoDate(member.dateOfBirth),
    member_status: member.status,
    plan_name: planName,
    expiry_date: isoDate(expiry),
    days_until_expiry: daysLeft,
    // Through the shared `money()`, so the automation pipeline and this one quote
    // the same plan the same way — gym language, currency symbol, one answer.
    payment_amount: price === undefined ? '' : money(price, language, currency),
    // The renewal date IS the period end — the day the current term stops is the
    // day the next one is charged. Two tokens for one date because gyms word it
    // both ways ("expires on" / "renews on") and a template should not have to
    // pick the wrong noun.
    renewal_date: isoDate(expiry),
    business_name: gymName,
    business_phone: business.phone,
    business_email: business.email,
    business_address: business.address,
    business_website: business.website,
    // -- Automation aliases --
    //
    // The drawer's template picker lists automation rule bodies alongside
    // marketing templates, so a body sent from here can carry `{{member_*}}`
    // tokens. All 20 automation tokens are covered below — nothing an automation
    // rule body can quote reaches a member blank from this path.
    //
    // The two that need facts outside the member row — `member_checkin_count`
    // and `member_points_balance` — are handed to this builder by its caller
    // (`_count.checkIns` on the select, `pointsBalance` as an argument) rather
    // than queried here, so it stays pure and its catalogue test can run without
    // Nest or Prisma. They matter because both are *known* keys:
    // `interpolateMergeFields` blanks a known token with no value, so a missing
    // one is an empty string in a member's inbox, not visible braces anyone
    // would notice.
    //
    // Against `AutomationMergeService.mergeValues` the two are now token-for-
    // token equal on the automation vocabulary.
    member_first_name: first,
    member_last_name: last,
    member_full_name: fullName,
    member_email: member.user.email,
    member_phone: phone,
    member_join_date: isoDate(member.joinedAt),
    member_birthday: isoDate(member.dateOfBirth),
    member_plan_name: planName,
    member_expiry_date: isoDate(expiry),
    member_days_until_expiry: daysLeft,
    member_checkin_count: String(member._count.checkIns),
    member_points_balance: String(pointsBalance),
    payment_due_date: isoDate(expiry),
  };

  return values;
}
