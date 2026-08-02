import { describe, expect, it } from 'vitest';
import {
  buildRRule,
  describeRecurrence,
  describeRRule,
  parseRRule,
  recurrenceSchema,
  type Recurrence,
} from './classes-admin';

/** Parse a recurrence through the schema so tests share the editor's defaults. */
function recurrence(input: Parameters<typeof recurrenceSchema.parse>[0]): Recurrence {
  return recurrenceSchema.parse(input);
}

describe('buildRRule', () => {
  it('emits a bare weekly rule with its weekdays', () => {
    const rrule = buildRRule(recurrence({ freq: 'WEEKLY', weekdays: ['MO', 'WE', 'FR'] }));
    expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('orders BYDAY in calendar order regardless of selection order', () => {
    const rrule = buildRRule(recurrence({ freq: 'WEEKLY', weekdays: ['FR', 'MO', 'WE'] }));
    expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('drops BYDAY for a daily frequency', () => {
    expect(buildRRule(recurrence({ freq: 'DAILY' }))).toBe('FREQ=DAILY');
  });

  it('never emits INTERVAL or an end clause', () => {
    // Every-N spacing is not on offer, and the validity window bounds the series.
    const rrule = buildRRule(recurrence({ freq: 'WEEKLY', weekdays: ['TU'] }));
    expect(rrule).toBe('FREQ=WEEKLY;BYDAY=TU');
    expect(rrule).not.toMatch(/INTERVAL|COUNT|UNTIL/);
  });
});

describe('parseRRule', () => {
  it('round-trips every shape buildRRule emits', () => {
    const cases: Recurrence[] = [
      recurrence({ freq: 'WEEKLY', weekdays: ['MO', 'WE', 'FR'] }),
      recurrence({ freq: 'WEEKLY', weekdays: ['TU'] }),
      recurrence({ freq: 'DAILY' }),
    ];
    for (const original of cases) {
      expect(parseRRule(buildRRule(original))).toEqual(original);
    }
  });

  it('tolerates an RRULE: prefix and lower-case keys', () => {
    expect(parseRRule('RRULE:freq=WEEKLY;byday=MO')).toEqual(
      recurrence({ freq: 'WEEKLY', weekdays: ['MO'] }),
    );
  });

  it('returns null for a frequency the editor dropped', () => {
    // MONTHLY was retired; a rule still carrying it is not one this editor can
    // show, so it must not be silently coerced into something else.
    expect(parseRRule('FREQ=MONTHLY')).toBeNull();
    expect(parseRRule('FREQ=MONTHLY;INTERVAL=2')).toBeNull();
  });

  it('returns null for an unsupported frequency', () => {
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;INTERVAL=1')).toBeNull();
  });

  it('accepts INTERVAL=1 but refuses wider spacing', () => {
    // INTERVAL=1 is the RFC default and means the same as omitting it.
    expect(parseRRule('FREQ=DAILY;INTERVAL=1')).toEqual(recurrence({ freq: 'DAILY' }));
    expect(parseRRule('FREQ=DAILY;INTERVAL=3')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU')).toBeNull();
  });

  it('returns null for end clauses the editor no longer has a control for', () => {
    // Accepting these would render a form meaning something wider than what is
    // stored, and saving it back would silently extend the real series.
    expect(parseRRule('FREQ=WEEKLY;BYDAY=MO;COUNT=10')).toBeNull();
    expect(parseRRule('FREQ=DAILY;UNTIL=20261231T235959Z')).toBeNull();
  });

  it('returns null for malformed tokens', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=0')).toBeNull();
    expect(parseRRule('NONSENSE')).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('renders cadence and weekdays in plain English', () => {
    expect(describeRecurrence(recurrence({ freq: 'DAILY' }))).toBe('Every day');
    expect(describeRecurrence(recurrence({ freq: 'WEEKLY', weekdays: ['MO', 'WE'] }))).toBe(
      'Every week on Mon, Wed',
    );
  });

  it('describeRRule falls back to the raw string for an unmodellable rule', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=MO')).toBe('Every week on Mon');
    expect(describeRRule('FREQ=HOURLY')).toBe('FREQ=HOURLY');
    // A pre-retirement monthly template still reads as *something* on the roster.
    expect(describeRRule('FREQ=MONTHLY')).toBe('FREQ=MONTHLY');
  });
});

describe('recurrenceSchema', () => {
  it('rejects a weekly recurrence with no weekday selected', () => {
    const result = recurrenceSchema.safeParse({ freq: 'WEEKLY', weekdays: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a frequency outside the supported pair', () => {
    expect(recurrenceSchema.safeParse({ freq: 'MONTHLY' }).success).toBe(false);
    expect(recurrenceSchema.safeParse({ freq: 'YEARLY' }).success).toBe(false);
  });
});
