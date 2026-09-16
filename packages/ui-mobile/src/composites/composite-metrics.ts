// The composites' pure arithmetic. No `react-native` import, ever.
//
// ===========================================================================
// WHY TWO SUBTRACTIONS GET THEIR OWN MODULE.
//
// `spotsLeft = capacity - bookedCount` and `full = spotsLeft <= 0` are the
// same two lines in `mobile-home-v2.tsx:341-342` and `mobile-classes.tsx:339-
// 340`, and they decide which of four actions a class card offers. Left to the
// screens, they are two copies that agree today; the moment one of them starts
// treating a waitlisted seat as taken, home offers "book" on a class the
// classes screen calls full, and the member finds out at the door.
//
// So `ClassCard` derives them ITSELF, and exports the derivation, because the
// screen needs the same number to write the label — "3 ადგილი დარჩა" is copy
// with a count interpolated into it, and copy is the caller's (package rule
// 1). Without an exported helper the screen would compute the count a second
// time, which is the exact duplication this file removes.
//
// Same shape as `layout/metrics.ts` and `feedback/feedback-metrics.ts`: the
// numbers live in a Vitest-tested module, and the component asks.
// ===========================================================================

/**
 * Seats still open on a class.
 *
 * NOT clamped at zero. An over-booked class (a manual admin override, a race
 * between two bookings) really is at −1, and a caller that wants to show a
 * count should show "full" instead — which is what {@link isClassFull} is for.
 * Clamping here would quietly turn −1 into 0 and make "0 spots left" a
 * legitimate-looking label, which is the string the artboards never draw.
 */
export function spotsLeftFor(capacity: number, bookedCount: number): number {
  return capacity - bookedCount;
}

/**
 * Is the class full?
 *
 * `<= 0`, not `=== 0`, for the over-booked case above. This is the one
 * predicate that decides between "book" and "join waitlist"; when
 * `bookedCount === capacity` the answer is TRUE and the card must show the
 * full label, never "0 left".
 */
export function isClassFull(capacity: number, bookedCount: number): boolean {
  return spotsLeftFor(capacity, bookedCount) <= 0;
}
