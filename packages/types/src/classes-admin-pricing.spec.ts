// @fit/types — class-type pricing validation (create/update body guards).

import { describe, expect, it } from 'vitest';
import { createClassTemplateSchema } from './classes-admin';

/** A minimal valid create body; individual tests override the pricing fields. */
function base(over: Record<string, unknown> = {}) {
  return {
    title: 'Morning HIIT',
    rrule: 'FREQ=WEEKLY;BYDAY=MO',
    validFrom: '2026-06-01',
    capacity: 12,
    durationMinutes: 60,
    ...over,
  };
}

describe('class-type pricing', () => {
  it('defaults to a FREE rule with no price', () => {
    const parsed = createClassTemplateSchema.parse(base());
    expect(parsed.pricingRule).toBe('FREE');
    expect(parsed.priceMinor).toBeNull();
    expect(parsed.includedPlanIds).toEqual([]);
  });

  it('coerces a paid price string to minor units', () => {
    const parsed = createClassTemplateSchema.parse(
      base({ pricingRule: 'PAID', priceMinor: '1500' }),
    );
    expect(parsed.priceMinor).toBe(1500);
  });

  it('rejects a PAID class with no price', () => {
    const result = createClassTemplateSchema.safeParse(base({ pricingRule: 'PAID' }));
    expect(result.success).toBe(false);
  });

  it('rejects a PAID class priced at zero', () => {
    const result = createClassTemplateSchema.safeParse(
      base({ pricingRule: 'PAID', priceMinor: 0 }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an INCLUDED class with no plans', () => {
    const result = createClassTemplateSchema.safeParse(base({ pricingRule: 'INCLUDED' }));
    expect(result.success).toBe(false);
  });

  it('accepts an INCLUDED class with at least one plan', () => {
    const parsed = createClassTemplateSchema.parse(
      base({ pricingRule: 'INCLUDED', includedPlanIds: ['plan-1'] }),
    );
    expect(parsed.includedPlanIds).toEqual(['plan-1']);
  });

  it('normalises blank PT and min-attendance fields to null', () => {
    const parsed = createClassTemplateSchema.parse(
      base({ pt30Minor: '', pt45Minor: '', pt60Minor: '', minAttendance: '' }),
    );
    expect(parsed.pt30Minor).toBeNull();
    expect(parsed.minAttendance).toBeNull();
  });
});
