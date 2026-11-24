# Member and portal timezone audit

Requirement: the client should see numbers matching the gym's data. Scope: admin
members and web `createDateTimeFormat` / `formatDate` / `formatTime` call sites.
Instants use the gym's IANA timezone. Recorded calendar dates and bucket keys keep
their existing UTC/calendar interpretation. No reporting or API buckets changed.

## Admin members

All paths below are relative to `apps/admin/app/(dashboard)/members/`.
Client components read `useGymTimeZone()` once at component entry and pass it to
formatting helpers. Server detail uses `await getGymTimeZone()`.

| File / call site | Classification and action |
| --- | --- |
| `members-table.tsx`: next billing | `nextBillingAt` instant; gym date. |
| `members-table.tsx`: last visit | `lastVisitAt` instant; gym date fallback and gym calendar today/yesterday/day count. Hour deltas remain elapsed time. Numeric native Intl parts identify the day without depending on translated month names. |
| `[id]/page.tsx`: member-since month/year and joined date | `joinedAt` instant; both use gym timezone. |
| `[id]/page.tsx`: next-billing KPI and email-preview expiry merge value | `nextBillingAt` instant; gym date. |
| `[id]/page.tsx`: booking-block end | Existing zoned helper; retains gym zone, now from shared server getter. |
| `[id]/member-tabs.tsx`: overview last visit | `lastVisitAt` instant; gym date. |
| Same: recent activity | `entry.at` instant; gym date/time. |
| Same: membership summary start/end and current-plan renewal | `currentPeriodStart`, `currentPeriodEnd` instants; gym dates. |
| Same: profile birth and membership-start fields | `dateOfBirth`, `startDate` recorded calendar days (even when serialized at UTC midnight); unchanged UTC formatting. |
| Same: previous memberships | `startedAt`, `renewsAt` instants; gym dates. |
| Same: class bookings | `startsAt` instant; gym date/time. |
| Same: freeze controls | `frozenUntil` instant; gym date. |
| Same: credit packs | `expiresAt` instant; gym date. |
| Same: payments | `paidAt` instant; gym date. |
| Same: invoices | `issuedAt` instant; gym date. |
| Same: purchases | `at` instant; gym date/time. |
| Same: access log | `at` instant; gym date/time. |
| Same: notes | `createdAt` instant; gym date/time. |

## Web

The portal already resolves the tenant timezone with `getActiveGymTimezone()` in
`apps/web/lib/active-gym.ts`. Reuse this source and pass a required `timeZone` prop
to client cards; no new context or duplicate settings lookup was introduced.

| Path under `apps/web/` / call site | Classification and action |
| --- | --- |
| `app/[locale]/member/(member)/account/membership/page.tsx`: current period end, member since | Instants; gym date. `memberSince` originates from `member.joinedAt.toISOString()` in the API. |
| Same: invoice date | Instant; gym date. API maps `issuedAt.toISOString()` into `date`. |
| Same directory, `renewal-payment.tsx`: payment due date | `dueAt` instant; gym date through required prop. |
| Same directory, `freeze-card.tsx`: frozen until | Instant; gym date through required prop. |
| `src/components/trainers/TrainerReviews.tsx`: created date | `createdAt` instant; gym date. Trainer page already loads the zone for its schedule and now passes it to reviews too. |
| `src/components/trainers/TrainerSchedule.tsx`: group heading | UTC carrier for an already gym-zoned day key; unchanged. |
| `src/components/classes/ClassListView.tsx`: group heading | Same UTC carrier; unchanged. |
| `src/components/classes/WeekCalendar.tsx`: weekday heading | Calendar day carrier, not appointment instant; unchanged (see limitation below). |
| `src/components/services/SlotCalendar.tsx`: weekday and day/month headings | Calendar day carriers; unchanged (see limitation below). |
| `src/components/classes/date-utils.ts`: week range | Calendar range, not instant display; unchanged. |
| Same: `formatZoned` | Existing instant-to-gym-wall-clock conversion produces UTC carrier before shared formatter; unchanged to avoid double conversion. Its date/time/relative-day wrappers already use gym zone. |
| `app/[locale]/member/(member)/home/page.tsx` and `src/components/account/booking-format.ts` | Search hits are explanatory comments, not unzoned formatter invocations. Actual displays use existing zoned helpers. |

## Unresolved / deliberately outside formatter scope

- Admin overview `StatCards` counts visits this month with browser-local
  `getFullYear()` / `getMonth()`. This is aggregation, not a formatter call, and
  was left unchanged under the instruction to preserve buckets. It can differ
  near a gym month boundary and requires an explicit aggregation follow-up.
- Web calendar navigation/day carriers use browser-local `startOfWeek`,
  `weekDays`, and `dayKey`, while headings read UTC. A viewer east of UTC may see
  a previous-day heading. Fixing the carrier model and navigation coherently is
  broader than passing a timezone to an instant formatter. Those paths remain
  unchanged, rather than applying a gym offset to calendar bucket carriers.
- Admin email preview is fixed here; server email send-time merge rendering is
  outside this owned scope and should be checked by the owner for consistency.
- Requires the parent's shared formatter change (honor explicit `timeZone`, keep
  UTC default), admin provider, and server getter before integration validation.

## Owner validation

Worker did not install, build, or run tests. `git diff --check` is the only executed
check. Runtime acceptance is **not done**; added tests are also unrun.

After integrating parent dependencies, run from the target checkout:

```sh
pnpm --filter @fit/admin test 'app/(dashboard)/members/members-table.test.tsx' 'app/(dashboard)/members/[id]/member-tabs.test.tsx'
pnpm --filter @fit/web test src/components/checkout/renewal-payment.test.tsx
pnpm --filter @fit/admin type-check
pnpm --filter @fit/web type-check
pnpm --filter @fit/admin build
pnpm --filter @fit/web build
```

Then inspect members roster, detail activity/access/payments, and portal membership
and trainer reviews in the running app, with a gym in `Asia/Tbilisi` and a browser
in another zone. Use instants around UTC midnight and month end; repeat with
`America/Los_Angeles` (including a DST boundary). Confirm birth/start days and
calendar headings/bucket keys are unchanged. Existing tests add a Tbilisi billing
midnight case, a gym-yesterday case, a western-zone access event, preserved
birth/start days, and renewal dates in both east/west zones.
