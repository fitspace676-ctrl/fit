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
  it('omits INTERVAL when 1 and emits a bare weekly rule', () => {
    const rrule = buildRRule(recurrence({ freq: 'WEEKLY', weekdays: ['MO', 'WE', 'FR'] }));
    expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('includes INTERVAL when greater than 1', () => {
    const rrule = buildRRule(recurrence({ freq: 'WEEKLY', interval: 2, weekdays: ['TU'] }));
    expect(rrule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU');
  });

  it('orders BYDAY in calendar order regardless of selection order', () => {
    const rrule = buildRRule(recurrence({ freq: 'WEEKLY', weekdays: ['FR', 'MO', 'WE'] }));
    expect(rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
  });

  it('emits COUNT and UNTIL end clauses', () => {
    expect(buildRRule(recurrence({ freq: 'DAILY', end: { type: 'count', count: 10 } }))).toBe(
      'FREQ=DAILY;COUNT=10',
    );
    expect(
      buildRRule(recurrence({ freq: 'DAILY', end: { type: 'until', until: '2026-12-31' } })),
    ).toBe('FREQ=DAILY;UNTIL=20261231T235959Z');
  });

  it('drops BYDAY for non-weekly frequencies', () => {
    expect(buildRRule(recurrence({ freq: 'MONTHLY', interval: 1 }))).toBe('FREQ=MONTHLY');
    expect(buildRRule(recurrence({ freq: 'DAILY', interval: 3 }))).toBe('FREQ=DAILY;INTERVAL=3');
  });
});

describe('parseRRule', () => {
  it('round-trips every shape buildRRule emits', () => {
    const cases: Recurrence[] = [
      recurrence({ freq: 'WEEKLY', weekdays: ['MO', 'WE', 'FR'] }),
      recurrence({
        freq: 'WEEKLY',
        interval: 2,
        weekdays: ['TU'],
        end: { type: 'count', count: 8 },
      }),
      recurrence({ freq: 'DAILY', interval: 3, end: { type: 'until', until: '2026-06-30' } }),
      recurrence({ freq: 'MONTHLY', interval: 1 }),
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

  it('returns null for an unsupported frequency', () => {
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
    expect(parseRRule('FREQ=YEARLY;INTERVAL=1')).toBeNull();
  });

  it('returns null for malformed tokens', () => {
    expect(parseRRule('FREQ=WEEKLY;BYDAY=XX')).toBeNull();
    expect(parseRRule('FREQ=WEEKLY;INTERVAL=0')).toBeNull();
    expect(parseRRule('NONSENSE')).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('renders cadence, weekdays, and end clause in plain English', () => {
    expect(describeRecurrence(recurrence({ freq: 'DAILY' }))).toBe('Every day');
    expect(describeRecurrence(recurrence({ freq: 'WEEKLY', weekdays: ['MO', 'WE'] }))).toBe(
      'Every week on Mon, Wed',
    );
    expect(
      describeRecurrence(
        recurrence({
          freq: 'WEEKLY',
          interval: 2,
          weekdays: ['TU'],
          end: { type: 'count', count: 1 },
        }),
      ),
    ).toBe('Every 2 weeks on Tue · for 1 occurrence');
    expect(
      describeRecurrence(
        recurrence({ freq: 'DAILY', end: { type: 'until', until: '2026-12-31' } }),
      ),
    ).toBe('Every day · until Dec 31, 2026');
  });

  it('describeRRule falls back to the raw string for an unmodellable rule', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=MO')).toBe('Every week on Mon');
    expect(describeRRule('FREQ=HOURLY')).toBe('FREQ=HOURLY');
  });
});

describe('recurrenceSchema', () => {
  it('rejects a weekly recurrence with no weekday selected', () => {
    const result = recurrenceSchema.safeParse({ freq: 'WEEKLY', weekdays: [] });
    expect(result.success).toBe(false);
  });
});
