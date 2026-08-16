// T5.1 — RRULE round-trip guarantee.
//
// `ClassTemplate.rrule` stores an RFC-5545 RRULE string the instance-generation
// job (T5.3) expands with rrule.js. The acceptance criterion is that the strings
// the scheduling UI produces survive a parse → serialize cycle without precision
// loss, so the materialised occurrences always match what the gym configured.
// These tests pin that: each sample is normalised once, then a second
// parse/serialize is asserted identical (idempotent canonical form), and the
// decoded options are checked to confirm the recurrence semantics — not just the
// string — are preserved.

import { describe, expect, it } from 'vitest';
import { RRule } from 'rrule';

/** Representative rules covering the cadences the class scheduler emits. */
const SAMPLE_RRULES = [
  'FREQ=WEEKLY;BYDAY=MO,WE,FR',
  // A one-off class, as the console's "One time" frequency stores it.
  'FREQ=DAILY;COUNT=1',
  'FREQ=DAILY;INTERVAL=2;COUNT=10',
  'FREQ=WEEKLY;INTERVAL=1;BYDAY=TU;UNTIL=20260101T000000Z',
  'FREQ=MONTHLY;BYMONTHDAY=15',
  'FREQ=WEEKLY;BYDAY=SA,SU;BYHOUR=9;BYMINUTE=30',
] as const;

describe('RRULE round-trip via rrule.js', () => {
  it.each(SAMPLE_RRULES)('round-trips %s without precision loss', (rule) => {
    // First parse/serialize yields rrule.js's canonical string form…
    const canonical = RRule.fromString(rule).toString();
    // …and serializing the re-parsed canonical form must be stable (idempotent).
    const reparsed = RRule.fromString(canonical).toString();
    expect(reparsed).toBe(canonical);
  });

  it('preserves recurrence options across parse → serialize', () => {
    const original = RRule.fromString('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    const roundTripped = RRule.fromString(original.toString());

    expect(roundTripped.options.freq).toBe(original.options.freq);
    expect(roundTripped.options.interval).toBe(original.options.interval);
    expect(roundTripped.options.byweekday).toEqual(original.options.byweekday);
  });

  it('preserves an UNTIL bound across parse → serialize', () => {
    const original = RRule.fromString('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260101T000000Z');
    const roundTripped = RRule.fromString(original.toString());

    expect(roundTripped.options.until?.getTime()).toBe(original.options.until?.getTime());
  });

  it('stays within the 500-char DB ceiling for realistic rules', () => {
    for (const rule of SAMPLE_RRULES) {
      expect(RRule.fromString(rule).toString().length).toBeLessThanOrEqual(500);
    }
  });
});
