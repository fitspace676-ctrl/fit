# Gym time-zone display audit

Worker implementation based on origin/main. **Not built; no tests or running-app verification performed.** Only source review, formatting and `git diff --check` were performed. The session owner must integrate and validate.

Acceptance source: “კი. მე მინდა რომ მათ მონაცემებს ემთხვეოდეს ციფრები და აქაც იგივე დახვდეს კლეინტს”.

## Requirements and verification status

1. Explicit valid IANA zone renders numeric fields on that clock, with deterministic ka/en names; no-zone output stays UTC. Code and unit cases added. **not done** (not run).
2. Share configured gym zone using existing layout settings read, React request cache and client context. No per-component fetch or API/schema changes. **not done** (not run).
3. Classify every admin formatter call as instant or date-only/bucket; zone all instant displays. Tables below and the companion audit cover these. **not done** (not run).
4. Audit web uses, fix simple cases and list larger issues. See `timezone-members-audit.md`. **not done** (not run).
5. Add formatter day-boundary/DST and affected component regression tests. Source added; execution deliberately left to owner. **not done**.

“not done” here means acceptance is unverified, not that the implementation was omitted. No requirement is claimed “verified by tests only” or “verified in the running app”.

## Shared implementation

- `packages/i18n/src/date-format.ts`: `Intl.DateTimeFormat('en-US')` extracts numeric Gregorian/Latin fields with explicit zone and h23. Existing CLDR tables still render ka/en names. No browser default zone is read.
- Invalid explicit zones throw RangeError, like Intl. Settings are validated with `isValidTimeZone`; missing/unreadable settings fall back to `DEFAULT_TIMEZONE`, matching the calendar.
- `apps/admin/lib/gym-locale.ts`: request-scoped React cache shares the existing settings read across layout and server pages.
- `apps/admin/components/gym-timezone.tsx`: server-seeded provider and hook; no client fetch.
- Numeric date+clock options previously returned only the date. Explicit-zone callers now also get the requested clock (POS receipts/orders/stock); omitted-zone callers retain legacy output.

## Call sites owned by this worker

Paths below are relative to `apps/admin/`. Additional admin sites are individually covered in `timezone-console-audit.md` and `timezone-members-audit.md`.

| Call site                                                                                                                | Classification and action                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `app/(dashboard)/overview/format.ts: formatTime` → `schedule-card.tsx`                                                   | INSTANT: class startsAt; new gym-zone argument from context.                                                 |
| `app/(dashboard)/overview/format.ts: formatDate` → `recent-cards.tsx`                                                    | INSTANT: membership expiresAt; gym-zone argument.                                                            |
| `overview/format.ts: timeAgo` → recent check-ins                                                                         | INSTANT duration, already zone-independent; left unchanged.                                                  |
| `components/agent/agent-chat.tsx: formatTime`                                                                            | INSTANT updatedAt; explicit zone. Today/yesterday grouping also compares gym-local dates, not viewer dates.  |
| `components/pos/pos-payment.tsx: printReceipt`                                                                           | INSTANT print timestamp; zone from context, including time previously dropped by numeric-date formatting.    |
| `app/(dashboard)/integrations/integrations-form.tsx`: both useFormatter verifiedAt displays                              | INSTANT; pass zone to next-intl for Flitt and Sender verification timestamps.                                |
| `app/(dashboard)/classes/format.ts: formatDateTime` → `classes/[id]/page.tsx` createdAt                                  | INSTANT; server page supplies shared gym zone.                                                               |
| `classes/format.ts: formatDate` → `classes/classes-table.tsx` validFrom and `classes/[id]/page.tsx` validFrom/validUntil | LEFT AS UTC: date-only template validity; parse with explicit Z so browser zone cannot shift the date.       |
| `app/(dashboard)/format.ts: formatBucket`                                                                                | LEFT AS UTC: API YYYY-MM-DD report keys, even when API computed them in gym zone.                            |
| `dashboard/home-parts.tsx: makeFormatters.time`                                                                          | INSTANT, ALREADY CORRECT: zonedClock uses supplied gym zone.                                                 |
| `dashboard/home-parts.tsx: makeFormatters.weekday/dayNumber/shortDate`                                                   | LEFT AS UTC: wallDay has already converted instant to gym-local calendar date; applying zone twice is wrong. |
| `dashboard/home-parts.tsx: greetingLine longDate`                                                                        | LEFT AS UTC: already-converted gym-local date token.                                                         |
| `lib/booking-block-format.ts: formatBookingBlockDate`                                                                    | INSTANT, ALREADY CORRECT: gym-zone date extraction + zonedClock; date token formatter stays UTC.             |
| `classes/pt-calendar/slot-detail.tsx: when`                                                                              | LEFT AS UTC: already-converted gym-local day token for slot.startsAt.                                        |
| `classes/pt-calendar/slot-detail.tsx: clock`                                                                             | INSTANT, ALREADY CORRECT: zonedClock.                                                                        |
| `classes/schedule/class-drawer.tsx: formatDay`                                                                           | LEFT AS UTC: converted gym date token.                                                                       |
| `classes/schedule/class-drawer.tsx: formatTime`                                                                          | INSTANT, ALREADY CORRECT: zonedClock for startsAt/endsAt.                                                    |
| `classes/schedule/calendar-board.tsx: weekdayShort`                                                                      | LEFT AS UTC: calendar day anchor.                                                                            |
| `classes/schedule/calendar-board.tsx: weekdayLong`                                                                       | LEFT AS UTC: calendar day anchor.                                                                            |
| `classes/schedule/calendar-board.tsx: longDate`                                                                          | LEFT AS UTC: day agenda anchor.                                                                              |
| `classes/schedule/calendar-board.tsx: formatDay`                                                                         | LEFT AS UTC: toolbar day anchor.                                                                             |
| `classes/schedule/calendar-board.tsx: formatRange dayMonth`                                                              | LEFT AS UTC: week start/end day anchors.                                                                     |
| `classes/schedule/calendar-board.tsx: formatRange withYear`                                                              | LEFT AS UTC: week start/end day anchors.                                                                     |
| `classes/schedule/calendar-board.tsx: formatMonth`                                                                       | LEFT AS UTC: month anchor.                                                                                   |
| `classes/schedule/calendar-board.tsx: formatTime` all month/day/week card labels                                         | INSTANT, ALREADY CORRECT: zonedClock with gym zone.                                                          |
| `classes/schedule/week-grid.tsx: weekdayShort`                                                                           | LEFT AS UTC: calendar day anchor.                                                                            |
| `classes/schedule/week-grid.tsx: instantDate`                                                                            | INSTANT, ALREADY CORRECT: native Intl explicitly uses timeZone.                                              |
| `classes/schedule/week.ts: zonedClock/zonedIsoDate/zonedMinutesOfDay`                                                    | INSTANT, ALREADY CORRECT: explicit numeric zone conversion; no presentation change.                          |

Date input creation, report-window computation, elapsed-time arithmetic and serializers are not instant presentation formatters and are not reinterpreted by this change. Marketing form input/read-write zone semantics are separate from the display helpers; see companion audit for caveats. No standalone notification timestamp formatter was found in apps/admin beyond the activity/feed surfaces covered above.

## Remaining limitations

- Invoice `issuedAt` mixes manual date-only values and automatically generated instants
  with no payload discriminator. The existing UTC invoice convention is preserved in
  billing roster, member detail and web. Automatic invoice issue instants are therefore
  **not fixed**; a data/API contract decision is needed to satisfy both semantics.
- Marketing date-input round trips still use the browser zone; this change corrects their
  read-only displays, not input-to-instant conversion.
- Member monthly visit aggregation and web calendar navigation/day carriers retain their
  existing browser-zone behavior. These are not simple instant formatter substitutions.
  See both companion audits; do not drop these limitations from the owner's report.

## Owner checks after integration

Run the existing workspace tests/type-check/build from the target checkout, not worker worktrees:

- `pnpm --filter @fit/i18n test` (includes date-format.spec.ts: Tbilisi midnight, Berlin spring/fall DST, New York previous date, UTC default, all existing option shapes).
- `pnpm --filter @fit/admin test`; `pnpm --filter @fit/admin type-check`; `pnpm --filter @fit/admin build`.
- Web test/type-check/build for changes documented by the web audit.

Then verify in the running console with gym `synergy`, settings timezone `Asia/Tbilisi`, first in a UTC browser, then a different browser zone; reload to exercise SSR/hydration:

1. Overview → today's schedule: MORNING YOGA stored at 05:00Z must show 09:00 (Georgian) / 09:00 AM (English).
2. At an instant 2026-11-24T23:30Z, any dated display must show Nov 25 and 03:30 where time is shown. Check recent-member expiry, member overview/history/check-ins/bookings/payments/notes, package/staff creation, invites expiry, marketing scheduled campaign, shop stock movement, POS order/refund/receipt, integration verification.
3. Existing class day/week/month grids, class drawer, PT detail and booking-block dates must remain aligned with 09:00; no second four-hour shift.
4. Member birthday and selected start date, class-template validity dates, report axes/buckets and invoice date-only fields must retain their original calendar date, including with a negative-offset gym.
5. Agent history: sessions after local midnight appear under Today; previous local day under Yesterday; timestamp clock is gym-local.
6. In a Berlin test gym, 2026-03-29T00:30Z → 01:30 and 01:30Z → 03:30. Changing browser zone must not change either result.
7. Test settings timezone refresh/navigation and staff permissions: both client and server pages must use the same saved zone.

No API payload or Prisma schema changes.
