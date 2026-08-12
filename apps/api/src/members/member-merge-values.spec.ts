import { describe, expect, it } from 'vitest';
import { AUTOMATION_MERGE_FIELDS, MARKETING_MERGE_FIELD_DEFS } from '@fit/types';
import { buildMemberMergeValues, type MemberMergeSource } from './member-merge-values';

const member: MemberMergeSource = {
  status: 'ACTIVE',
  joinedAt: new Date('2025-03-04T00:00:00Z'),
  dateOfBirth: new Date('1990-07-19T00:00:00Z'),
  user: { name: 'Nino Beridze', email: 'nino@example.com', phone: '+995 555 10 20 30' },
  subscriptions: [
    {
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      plan: { name: 'Unlimited', priceAmount: 12000, currency: 'GEL' },
    },
  ],
  _count: { checkIns: 47 },
};

const business = {
  phone: '+995 322 00 00 00',
  email: 'hello@fitspace.ge',
  address: '12 Rustaveli Ave, Tbilisi',
  website: 'https://fitspace.ge',
};

function build(overrides?: Partial<Parameters<typeof buildMemberMergeValues>[0]>) {
  return buildMemberMergeValues({
    member,
    gymName: 'FitSpace',
    business,
    language: 'en',
    pointsBalance: 320,
    today: new Date('2026-08-12T00:00:00Z'),
    ...overrides,
  });
}

describe('buildMemberMergeValues', () => {
  // Rule 1 of the catalogue, as an executable check. This is the test that would
  // have caught {{location}}, {{class_name}} and {{payment_amount}} shipping dead.
  it('fills every token the catalogue offers', () => {
    const values = build();

    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      const name = field.token.replace(/[{}]/g, '');
      expect(values[name], `${field.token} is offered but never filled`).toBeDefined();
    }
  });

  it('splits the display name into first and last', () => {
    const values = build();

    expect(values.first_name).toBe('Nino');
    expect(values.last_name).toBe('Beridze');
    expect(values.full_name).toBe('Nino Beridze');
  });

  it('formats dates as YYYY-MM-DD', () => {
    const values = build();

    expect(values.join_date).toBe('2025-03-04');
    expect(values.birthday).toBe('1990-07-19');
    expect(values.expiry_date).toBe('2026-09-01');
    expect(values.renewal_date).toBe('2026-09-01');
  });

  it('counts whole days until expiry from today', () => {
    expect(build().days_until_expiry).toBe('20');
  });

  // Floors, like `AutomationMergeService` does with the same rationale: a term
  // that lapses later today has zero whole days left, not one. This is the case
  // the two pipelines used to answer differently.
  it('reads a same-day expiry as no days left, not one', () => {
    const values = build({
      member: {
        ...member,
        subscriptions: [
          {
            currentPeriodEnd: new Date('2026-08-12T18:00:00Z'),
            plan: { name: 'Unlimited', priceAmount: 12000, currency: 'GEL' },
          },
        ],
      },
      today: new Date('2026-08-12T09:00:00Z'),
    });

    expect(values.days_until_expiry).toBe('0');
  });

  // Through the shared `money()`, so the price reads exactly as an automation
  // send would render it — `Intl` output, non-breaking space included.
  it('renders the plan price in the gym language and currency', () => {
    expect(build().payment_amount).toBe('GEL\u00A0120.00');
    expect(build({ language: 'ka' }).payment_amount).toBe('120,00\u00A0₾');
  });

  it('carries the gym contact details', () => {
    const values = build();

    expect(values.business_name).toBe('FitSpace');
    expect(values.business_website).toBe('https://fitspace.ge');
  });

  // A blank is a fine value; an undefined is not. Undefined means the token falls
  // through to the blanking pass, which is the failure mode this whole change is
  // about.
  it('fills every token with an empty string when the member has no subscription', () => {
    const values = build({ member: { ...member, subscriptions: [], dateOfBirth: null } });

    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(values[field.token.replace(/[{}]/g, '')]).toBeDefined();
    }
    expect(values.plan_name).toBe('');
    expect(values.birthday).toBe('');
  });

  it('keeps the automation aliases so either vocabulary personalizes', () => {
    const values = build();

    expect(values.member_first_name).toBe('Nino');
    expect(values.member_plan_name).toBe('Unlimited');
  });

  // The drawer's template picker merges automation rule bodies into the same
  // list as marketing templates, so a body sent from here can quote any offered
  // automation token. Every one of them is a *known* key, and
  // `interpolateMergeFields` blanks a known key with no value — so a token this
  // resolver misses is not a visible `{{member_checkin_count}}` staff can spot
  // in the preview, it is a blank in the member's inbox.
  it('fills every offered automation token too', () => {
    const values = build();

    for (const field of AUTOMATION_MERGE_FIELDS) {
      const name = field.token.replace(/[{}]/g, '');
      expect(
        values[name],
        `${field.token} can be sent from here but is never filled`,
      ).toBeDefined();
    }
  });

  it('fills the check-in count and points balance the caller supplies', () => {
    const values = build();

    expect(values.member_checkin_count).toBe('47');
    expect(values.member_points_balance).toBe('320');
  });

  // Zero is a real answer — a brand-new member with no check-ins and no ledger
  // entry must read "0", not "". `String(0)` is falsy-adjacent enough that a
  // `|| ''` slipping in here would be invisible until a member got a blank.
  it('reads a zero check-in count and a zero balance as "0", not blank', () => {
    const values = build({
      member: { ...member, _count: { checkIns: 0 } },
      pointsBalance: 0,
    });

    expect(values.member_checkin_count).toBe('0');
    expect(values.member_points_balance).toBe('0');
  });
});
