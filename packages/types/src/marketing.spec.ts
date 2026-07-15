import { describe, expect, it } from 'vitest';
import {
  MARKETING_CHANNEL_CATALOG,
  audienceCriteriaSchema,
  createCampaignSchema,
  createPromoCodeSchema,
  createMessageTemplateSchema,
  interpolateMergeFields,
  listCampaignsQuerySchema,
  marketingChannelSchema,
  updatePromoCodeSchema,
  validatePromoCodeSchema,
} from './marketing';

describe('marketing channel catalog', () => {
  it('every catalog value is a valid channel enum member', () => {
    for (const meta of MARKETING_CHANNEL_CATALOG) {
      expect(marketingChannelSchema.safeParse(meta.value).success).toBe(true);
    }
    expect(MARKETING_CHANNEL_CATALOG.map((c) => c.value).sort()).toEqual(['email', 'push', 'sms']);
  });
});

describe('audienceCriteriaSchema', () => {
  it('defaults an empty bag and accepts the full filter set', () => {
    expect(audienceCriteriaSchema.parse({})).toEqual({});
    const parsed = audienceCriteriaSchema.parse({
      membershipPlanIds: ['plan-1'],
      status: ['ACTIVE'],
      joinedAfter: '2026-01-01T00:00:00.000Z',
      notVisitedForDays: 30,
      minSpent: 5000,
      minClassAttendance: 3,
    });
    expect(parsed.minClassAttendance).toBe(3);
  });

  it('rejects a non-positive visit window', () => {
    expect(audienceCriteriaSchema.safeParse({ visitedWithinDays: 0 }).success).toBe(false);
  });

  it('rejects an unknown member status', () => {
    expect(audienceCriteriaSchema.safeParse({ status: ['EXPIRED'] }).success).toBe(false);
  });
});

describe('createPromoCodeSchema', () => {
  it('accepts a percentage code with defaults', () => {
    const parsed = createPromoCodeSchema.parse({
      code: 'SPRING25',
      discountType: 'percentage',
      discountValue: 25,
    });
    expect(parsed.status).toBe('active');
    expect(parsed.description).toBe('');
  });

  it('rejects a percentage over 100', () => {
    const result = createPromoCodeSchema.safeParse({
      code: 'HALF',
      discountType: 'percentage',
      discountValue: 150,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a large fixed discount (minor units)', () => {
    const parsed = createPromoCodeSchema.parse({
      code: 'WELCOME50',
      discountType: 'fixed',
      discountValue: 5000,
    });
    expect(parsed.discountValue).toBe(5000);
  });

  it('rejects a code with spaces or symbols', () => {
    expect(
      createPromoCodeSchema.safeParse({
        code: 'BAD CODE!',
        discountType: 'fixed',
        discountValue: 1,
      }).success,
    ).toBe(false);
  });

  it('update: rejects a percentage over 100 only when the value is present', () => {
    expect(updatePromoCodeSchema.safeParse({ description: 'x' }).success).toBe(true);
    expect(
      updatePromoCodeSchema.safeParse({ discountType: 'percentage', discountValue: 200 }).success,
    ).toBe(false);
  });
});

describe('validatePromoCodeSchema', () => {
  it('accepts a code with an optional amount', () => {
    expect(validatePromoCodeSchema.parse({ code: 'SPRING25', amount: 10000 }).amount).toBe(10000);
    expect(validatePromoCodeSchema.parse({ code: 'SPRING25' }).amount).toBeUndefined();
  });
});

describe('createMessageTemplateSchema', () => {
  it('requires a non-empty body and defaults the category', () => {
    const parsed = createMessageTemplateSchema.parse({
      name: 'Welcome',
      channel: 'email',
      body: 'Hi {{first_name}}',
    });
    expect(parsed.category).toBe('');
    expect(
      createMessageTemplateSchema.safeParse({ name: 'x', channel: 'email', body: '' }).success,
    ).toBe(false);
  });
});

describe('createCampaignSchema', () => {
  it('accepts a draft with no audience (whole roster) and defaults', () => {
    const parsed = createCampaignSchema.parse({ name: 'Blast', channel: 'push' });
    expect(parsed.scheduleType).toBe('now');
    expect(parsed.body).toBe('');
  });

  it('rejects naming both a segment and inline criteria', () => {
    const result = createCampaignSchema.safeParse({
      name: 'Blast',
      channel: 'email',
      audienceSegmentId: 'seg-1',
      inlineCriteria: { status: ['ACTIVE'] },
    });
    expect(result.success).toBe(false);
  });

  it('requires scheduledAt when scheduleType is scheduled', () => {
    expect(
      createCampaignSchema.safeParse({ name: 'Blast', channel: 'email', scheduleType: 'scheduled' })
        .success,
    ).toBe(false);
    expect(
      createCampaignSchema.safeParse({
        name: 'Blast',
        channel: 'email',
        scheduleType: 'scheduled',
        scheduledAt: '2026-08-01T09:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('listCampaignsQuerySchema', () => {
  it('coerces pagination and applies defaults', () => {
    const parsed = listCampaignsQuerySchema.parse({ page: '2', limit: '10' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(10);
    expect(parsed.sort).toBe('createdAt');
    expect(parsed.dir).toBe('desc');
  });
});

describe('interpolateMergeFields', () => {
  it('replaces provided tokens with their values', () => {
    const out = interpolateMergeFields('Hi {{first_name}} {{last_name}}!', {
      first_name: 'Davit',
      last_name: 'Kvaratskhelia',
    });
    expect(out).toBe('Hi Davit Kvaratskhelia!');
  });

  it('is case-insensitive and tolerates inner whitespace', () => {
    expect(interpolateMergeFields('Hi {{ First_Name }}', { first_name: 'Davit' })).toBe('Hi Davit');
  });

  it('blanks a known catalog token with no provided value (never leaks raw braces)', () => {
    expect(interpolateMergeFields('Plan: {{plan_name}}.', {})).toBe('Plan: .');
  });

  it('leaves an unknown token untouched (a visible typo for staff)', () => {
    expect(interpolateMergeFields('Hi {{frist_name}}', { first_name: 'Davit' })).toBe(
      'Hi {{frist_name}}',
    );
  });

  it('replaces every occurrence of a repeated token', () => {
    expect(interpolateMergeFields('{{first_name}} {{first_name}}', { first_name: 'Ana' })).toBe(
      'Ana Ana',
    );
  });

  it('with blankMissing:false leaves a known-but-unprovided token raw (client preview)', () => {
    expect(
      interpolateMergeFields(
        'Hi {{first_name}} — {{business_name}}',
        { first_name: 'Ana' },
        {
          blankMissing: false,
        },
      ),
    ).toBe('Hi Ana — {{business_name}}');
  });
});
