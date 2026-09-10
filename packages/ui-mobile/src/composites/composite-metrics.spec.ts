// The composites' arithmetic, on Vitest. Two functions, and they decide which
// of four actions a member is offered on every class in the app.
//
// The regression this guards is not "subtraction is wrong". It is the two
// screens drifting: home and classes each computed these two lines for
// themselves in the artboards, and the day one of them starts counting a
// waitlisted seat as taken, the same class offers "book" on one screen and
// "join waitlist" on the other. Testing them here is what lets `ClassCard`
// own them — see the header of `composite-metrics.ts`.

import { describe, expect, it } from 'vitest';

import { isClassFull, spotsLeftFor } from './composite-metrics';

describe('spotsLeftFor', () => {
  it('is capacity minus bookings', () => {
    expect(spotsLeftFor(20, 17)).toBe(3);
    expect(spotsLeftFor(20, 0)).toBe(20);
  });

  it('reaches zero exactly at capacity', () => {
    expect(spotsLeftFor(20, 20)).toBe(0);
  });

  // NOT clamped. An over-booked class is a real state (an admin override, or
  // two bookings racing), and clamping it to 0 would make "0 spots left" look
  // like a legitimate label — a string the artboards never draw, because the
  // full label is what belongs there.
  it('goes negative on an over-booked class rather than clamping', () => {
    expect(spotsLeftFor(20, 23)).toBe(-3);
  });
});

describe('isClassFull', () => {
  it('is false while a seat remains', () => {
    expect(isClassFull(20, 19)).toBe(false);
  });

  // THE BOUNDARY THAT MATTERS. `bookedCount === capacity` is FULL, and the
  // card must show the full label, never "0 left".
  it('is true at exactly capacity', () => {
    expect(isClassFull(20, 20)).toBe(true);
  });

  it('is true when over-booked', () => {
    expect(isClassFull(20, 23)).toBe(true);
  });

  it('agrees with spotsLeftFor at every crossing', () => {
    for (let booked = 0; booked <= 25; booked++) {
      expect(isClassFull(20, booked)).toBe(spotsLeftFor(20, booked) <= 0);
    }
  });

  // A class with no capacity at all — an unpublished draft, or a service slot
  // that has not been sized — is full, not bookable. The alternative reading
  // (0 capacity means unlimited) would offer a member a seat in a room that
  // does not exist.
  it('treats a zero-capacity class as full', () => {
    expect(isClassFull(0, 0)).toBe(true);
  });
});
