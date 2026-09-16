// The typed-date mask.
//
// An off-by-one in a slice here is a birthday silently shifted by a month, and
// nothing downstream would notice: `1994-04-01` and `1994-01-04` are both
// well-formed dates the API accepts. So the two notations are pinned in both
// directions, including the round trip.
import { dayInputFromIso, isoFromDayInput, maskDayInput } from './date-mask';

describe('maskDayInput', () => {
  it('inserts the separators as the digits arrive', () => {
    expect(maskDayInput('0')).toBe('0');
    expect(maskDayInput('01')).toBe('01');
    expect(maskDayInput('010')).toBe('01.0');
    expect(maskDayInput('0104')).toBe('01.04');
    expect(maskDayInput('01041994')).toBe('01.04.1994');
  });

  it('is idempotent over its own output — it runs on every keystroke', () => {
    const once = maskDayInput('01041994');
    expect(maskDayInput(once)).toBe(once);
  });

  it('never re-adds a separator ahead of the digit that earns it', () => {
    // Backspacing the last digit of `01.0` must leave `01`, not `01.`.
    expect(maskDayInput('01.')).toBe('01');
  });

  it('drops everything that is not a digit, and caps at eight', () => {
    expect(maskDayInput('1a2/3-4 5678')).toBe('12.34.5678');
    expect(maskDayInput('010419941234')).toBe('01.04.1994');
  });
});

describe('isoFromDayInput', () => {
  it('turns a complete day-first entry into the wire format', () => {
    expect(isoFromDayInput('01.04.1994')).toBe('1994-04-01');
  });

  it('answers EMPTY for anything short of eight digits', () => {
    // Unanswered, not invalid: `signupBodyFor` omits an empty optional field,
    // while a half-typed one would be sent and rejected as a 400.
    expect(isoFromDayInput('')).toBe('');
    expect(isoFromDayInput('01.04.199')).toBe('');
  });

  it('does NOT range-check — that is the API’s and the policy’s job', () => {
    expect(isoFromDayInput('31.02.2026')).toBe('2026-02-31');
  });
});

describe('dayInputFromIso', () => {
  it('reads the wire format back day-first', () => {
    expect(dayInputFromIso('1994-04-01')).toBe('01.04.1994');
  });

  it('answers empty for a value that is not a calendar day', () => {
    expect(dayInputFromIso('')).toBe('');
    expect(dayInputFromIso('1994-4-1')).toBe('');
  });

  it('round-trips', () => {
    expect(isoFromDayInput(dayInputFromIso('2026-12-31'))).toBe('2026-12-31');
  });
});
