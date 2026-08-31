import { BadRequestException } from '@nestjs/common';
import { isStartDateWithinPolicy, startDateBounds, type GymStartDatePolicy } from '@fit/types';
import { zonedIsoDate } from '../reports/zoned-time.util';

/**
 * `400` code returned when a membership start date falls outside the gym's
 * configured window. Machine-readable, in the mould of `EMAIL_TAKEN` /
 * `MEMBER_INTAKE_REQUIRED`, so the join wizard can put the error on the date
 * input rather than showing a bare string; `min`/`max` travel with it so the
 * client can say which days *are* open without a second round trip.
 */
export const START_DATE_OUT_OF_RANGE_CODE = 'START_DATE_OUT_OF_RANGE';

/**
 * Hold a chosen start date to the gym's window, or raise a
 * `400 START_DATE_OUT_OF_RANGE`.
 *
 * The window bounds what a SIGNED-OUT VISITOR may pick, so this guards exactly
 * one door: `POST /auth/signup`. Enforced on the server for the same reason the
 * intake check is — a bounded `<input type="date">` is a courtesy, not a control,
 * and that body is public, unauthenticated, and under no obligation to have come
 * from the form at all. It therefore runs whether or not the gym has switched the
 * `startDate` intake toggle on: the toggle decides whether the date is *asked
 * for*, the policy decides which answers are *accepted*, and a body that
 * volunteers one to a gym that never asks is still answerable to the window.
 *
 * Deliberately NOT applied to the staff console's `POST /members` or
 * `PATCH /members/:id`. Backdating an enrolment is a correction, and
 * {@link gymStartDatePolicySchema} says in as many words that corrections belong
 * to staff on the member record rather than to a self-serve wizard — so holding
 * the front desk to the visitor's window would refuse the very case the policy
 * was written to leave alone.
 *
 * "Today" is resolved in the GYM's zone, never the server's: a Tbilisi gym is
 * already on tomorrow while a UTC server is still on today, so a member picking
 * "today" from their phone at 01:00 local must not be told their own date is in
 * the past.
 *
 * An absent or blank date is not an error — it means "no start date recorded",
 * which is every membership created before the toggle existed.
 *
 * @param value    the chosen day as `YYYY-MM-DD`, or nothing
 * @param policy   the gym's configured window (`gymPublicStartDatePolicy`)
 * @param timeZone the gym's IANA zone (`gymPublicTimezone`) — where "today" is
 * @param now      the instant to read "today" from; injectable for tests
 */
export function assertStartDateWithinPolicy(
  value: string | null | undefined,
  policy: GymStartDatePolicy,
  timeZone: string,
  now: Date = new Date(),
): void {
  const day = value?.trim();
  if (!day) return;

  const today = zonedIsoDate(now, timeZone);
  if (isStartDateWithinPolicy(day, policy, today)) return;

  const { min, max } = startDateBounds(policy, today);
  throw new BadRequestException({
    message: `Start date must be a calendar day between ${min} and ${max}`,
    code: START_DATE_OUT_OF_RANGE_CODE,
    min,
    max,
  });
}
