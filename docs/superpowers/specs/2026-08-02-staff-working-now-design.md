# Who's Working Now — design

**Date:** 2026-08-02
**Status:** approved

## Problem

The staff console's "Who's Working Today" card lists everyone whose weekly schedule
places them on shift **at any point today**. At 20:00 it still shows a trainer whose
shift reads `09:00 – 23:00` alongside one who left at 12:00, with nothing to tell them
apart.

What the console is actually asked at the front desk is narrower: **who is in the gym
right now?** The card should answer that question and only that question.

A second defect falls out of the same code. `getWorkingToday()` resolves "today" with
`new Date().getDay()` — the **server's** weekday, not the gym's. The API runs in UTC and
the default gym timezone is `Asia/Tbilisi` (UTC+4), so between 20:00 and midnight local
the card already shows the _previous_ day's roster. Filtering on time-of-day without
fixing this would multiply the error rather than expose it.

## What already exists

| Piece                                                              | Where                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| `ShiftSlot` — weekly schedule, `dayOfWeek` 0=Mon, `HH:MM` times    | `packages/db/prisma/schema.prisma:2558`                  |
| `getWorkingToday()` — day-scoped roster query                      | `apps/api/src/staff/staff-depth.service.ts:386`          |
| `GET /staff/working-today`                                         | `apps/api/src/staff/staff-depth.controller.ts:189`       |
| `WorkingTodayRow` / `WorkingTodayResponse`                         | `packages/types/src/staff-depth.ts:232`                  |
| `fetchWorkingToday()` — the one and only client                    | `apps/admin/lib/api.ts:1414`                             |
| `WhosWorkingCard` — the card itself                                | `apps/admin/app/(dashboard)/staff/whos-working-card.tsx` |
| Gym timezone at `settings.locale.timezone`, default `Asia/Tbilisi` | `packages/types/src/gym-settings.ts:39,121`              |
| Established "resolve the gym's timezone" pattern                   | `apps/api/src/orders/orders.service.ts:207-212`          |
| `zonedDateString` — the same `Intl.DateTimeFormat` technique       | `apps/api/src/ops/ops-notifications.service.ts:442`      |

No schema change is required. The weekly schedule already holds everything needed; the
only missing input is _which_ clock to read "now" from.

## Decisions

Settled during brainstorming, recorded here so the plan does not relitigate them:

1. **"Working now" means scheduled now** — `startTime <= now < endTime` against the
   gym's weekly schedule. Not a real clock-in: no staff attendance model exists
   (`CheckIn` is members-only), and adding one is a separate, much larger piece of work.
2. **Only the current shift is shown.** The rest of today's roster is dropped, not
   demoted to a secondary list or a second tab.
3. **No auto-refresh.** The card is computed server-side on page load and goes stale
   until the operator reloads. `page.tsx` is already `force-dynamic`, so this needs no
   new machinery.
4. **The names change with the meaning.** The endpoint, types, translation keys and card
   title all move from "today" to "now". The API is private and has exactly one consumer,
   so a silent semantic change under an unchanged name would be the worse option.

## Design

### Data flow

```
Gym.settings.locale.timezone ─┐
                              ├─► gymLocalNow() → { dayOfWeek 0-6, time "HH:MM" }
ShiftSlot (dayOfWeek,         │            │
           startTime, endTime)┘            ▼
                              WHERE dayOfWeek = dayOfWeek
                                AND startTime <= time
                                AND endTime   >  time
                                        │
                                        ▼
                        GET /staff/working-now → StaffPage (SSR) → WhosWorkingCard
```

Both `startTime` and `endTime` are zero-padded `HH:MM` strings, so lexicographic
comparison is chronological comparison and the whole filter pushes down into SQL.

**Boundaries.** `startTime` is inclusive, `endTime` exclusive. A shift ending at 17:00 is
gone at 17:00; a shift starting at 17:00 is present at 17:00. Back-to-back shifts
therefore hand over cleanly, with neither a gap nor an overlap.

### `gymLocalNow(timeZone)`

A new exported pure function in `apps/api/src/staff/staff-depth.service.ts`, built on
`Intl.DateTimeFormat` — the same technique `zonedDateString` already uses:

```ts
export function gymLocalNow(
  timeZone: string,
  instant = new Date(),
): { dayOfWeek: number; time: string };
```

It returns the weekday in the app's convention (**0 = Monday … 6 = Sunday**) and the local
time as `"HH:MM"` on a 24-hour clock. Exported separately from the service so it can be
tested directly against fixed instants without a Prisma mock.

Implementation, pinned here because two `Intl` details bite:

```ts
const parts = new Intl.DateTimeFormat('en-US', {
  timeZone,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).formatToParts(instant);
```

- **`hourCycle: 'h23'`, not `hour12: false`.** The latter yields `"24"` for midnight under
  some ICU builds, which would sort after every `endTime` and silently empty the card for
  an hour each night.
- **The weekday comes from the formatted name**, mapped through a
  `{ Mon: 0, Tue: 1, … Sun: 6 }` lookup. Reading `Date#getDay()` and rotating would
  reintroduce the server-timezone bug this change exists to fix — the whole point is that
  the weekday must come from the same zoned format call as the time.

`instant` is a parameter with a default rather than a bare `new Date()` call so tests can
pin it without fake timers.

### `getWorkingNow()`

Replaces `getWorkingToday()`:

```ts
const gym = await this.prisma.client.gym.findUnique({
  where: { id: this.tenant.gymId },
  select: { settings: true },
});
const { locale } = gymSettingsStoredSchema.parse(gym?.settings ?? {});
const { dayOfWeek, time } = gymLocalNow(locale.timezone);

const shifts = await this.prisma.client.shiftSlot.findMany({
  where: {
    dayOfWeek,
    startTime: { lte: time },
    endTime: { gt: time },
    staff: { role: { in: STAFF_ROLES }, status: GymMemberStatus.ACTIVE },
  },
  select: {
    /* unchanged */
  },
  orderBy: [{ startTime: 'asc' }],
});
```

`gymSettingsStoredSchema.parse(gym?.settings ?? {})` fills `Asia/Tbilisi` when a gym has
never saved settings, so an unconfigured gym degrades to the platform default instead of
throwing.

The controller route becomes `@Get('working-now')`. Guards, tenant scoping and the
`select` shape are untouched.

### Types and translations

| Before                       | After                      |
| ---------------------------- | -------------------------- |
| `WorkingTodayRow`            | `WorkingNowRow`            |
| `WorkingTodayResponse`       | `WorkingNowResponse`       |
| `fetchWorkingToday()`        | `fetchWorkingNow()`        |
| `GET /staff/working-today`   | `GET /staff/working-now`   |
| `admin.staff.workingToday.*` | `admin.staff.workingNow.*` |

`WorkingNowResponse` drops `dayOfWeek`. It existed so the card could label itself "today";
nothing reads it now, and a "now" card has no weekday to print. The response narrows to
`{ shifts }`.

Copy, en / ka:

| Key       | en                           | ka                   |
| --------- | ---------------------------- | -------------------- |
| `title`   | Who's Working Now            | ვინ მუშაობს ახლა     |
| `onShift` | {count} on shift now         | {count} ცვლაზეა ახლა |
| `empty`   | No one is on shift right now | ახლა ცვლაზე არავინაა |

### UI

`whos-working-card.tsx` changes in name only — prop type, translation keys, JSDoc. The
StyleX styles, avatar initials, role badge, hours line and empty state are all unchanged,
because the card's _shape_ was never the problem.

`staff-console.tsx` renames its `workingToday` prop to `workingNow`; `page.tsx` renames
its `fetchWorkingToday()` call. `page.tsx` keeps `export const dynamic = 'force-dynamic'`,
which is what makes decision 3 work without any client-side timer.

## Error handling

Unchanged from today. `page.tsx` already wraps all four parallel fetches in one
`try/catch` that renders the error card on `ApiError` or an unreachable API, and
`/staff` is already gated to `OWNER` by middleware plus the API's `StaffManage` guard.
The one new failure mode — a gym whose stored settings are absent or malformed — is
absorbed by `gymSettingsStoredSchema`'s defaults rather than surfaced.

## Testing

`apps/api/src/staff/staff-depth.service.spec.ts` — the `getWorkingToday` describe block
is rewritten as `getWorkingNow`. `setup()` gains `gym: make(models?.gym)`.

- mid-shift (`10:00–18:00`, local 12:00) → the row is returned
- the `where` clause carries `startTime: { lte }` and `endTime: { gt }` with the gym-local
  time, and `staff.status === 'ACTIVE'`
- **timezone regression:** system clock at Wednesday 21:00 UTC with `Asia/Tbilisi` must
  query **Thursday** (`dayOfWeek` 3), not Wednesday — this is the bug in production today
- `settings: null` → falls back to `Asia/Tbilisi` instead of throwing
- a staff member with no name still falls back to their email (existing case, kept)

`gymLocalNow` is tested directly against fixed instants across several zones, including
the UTC-evening / next-day-in-Tbilisi rollover and a zone west of UTC.

`pnpm lint`, `pnpm type-check` and `pnpm test` must pass; the rename touches
`@fit/types`, `@fit/api` and `@fit/admin`, so a green `type-check` is what proves no
call site was missed.

## Out of scope

- **Staff clock-in / clock-out.** Real attendance needs a new model, a migration, an API
  and a habit change at the front desk. Separate piece of work.
- **Overnight shifts.** `shiftSlotInputSchema` enforces `endTime > startTime`
  (`packages/types/src/staff-depth.ts:195`), so a 22:00–02:00 shift cannot be entered at
  all. Supporting them means changing the schedule editor, not this card.
- **Live refresh.** Explicitly declined; the card is accurate as of page load.
