# Who's Working Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow the staff console's on-shift card from "everyone rostered today" to "everyone on shift right now", read from the gym's own clock rather than the server's.

**Architecture:** No schema change. A new pure helper resolves the gym's local weekday and `HH:MM` from `Gym.settings.locale.timezone` via one `Intl.DateTimeFormat` call; the existing `ShiftSlot` query gains `startTime <= now < endTime` bounds against it. Behaviour lands first under the old names (Task 2), then the endpoint, types, translation keys and copy are renamed today → now (Task 3), so every commit leaves the monorepo green.

**Tech Stack:** NestJS + Prisma (`@fit/api`), Zod schemas and shared types (`@fit/types`), Next.js 15 App Router + StyleX (`@fit/admin`), next-intl (`@fit/i18n`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-02-staff-working-now-design.md`

## Global Constraints

- Branch: `feat/staff`. Base is `origin/main` at `454a7be`.
- Weekday convention throughout this codebase is **0 = Monday … 6 = Sunday** — it is _not_ `Date#getDay()`.
- `ShiftSlot.startTime` / `endTime` are zero-padded `"HH:MM"` strings. Compare them as strings; do not parse to numbers.
- Shift boundaries: `startTime` **inclusive**, `endTime` **exclusive** (`lte` / `gt`).
- Gym timezone lives at `settings.locale.timezone`; resolve it with `gymSettingsStoredSchema.parse(gym?.settings ?? {})`, which defaults to `Asia/Tbilisi`. Never read a raw JSON field.
- Never reintroduce `new Date().getDay()` — the weekday must come from the same zoned format call as the time.
- Package manager is `pnpm`. Run API tests with `pnpm --filter @fit/api test <pattern>`.
- Commit messages: imperative subject, no `Generated with` footer, end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Husky + lint-staged run `eslint --max-warnings 0` and `prettier --check` on commit. If a commit is rejected for formatting, run `pnpm format` and re-stage.

## File Structure

| File                                                     | Responsibility                                                              | Task    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ------- |
| `apps/api/src/staff/staff-depth.service.ts`              | `gymLocalNow` helper; `getWorkingToday` → `getWorkingNow` query             | 1, 2, 3 |
| `apps/api/src/staff/staff-depth.service.spec.ts`         | Unit tests for both                                                         | 1, 2, 3 |
| `apps/api/src/staff/staff-depth.controller.ts`           | Route rename `working-today` → `working-now`                                | 3       |
| `packages/types/src/staff-depth.ts`                      | `WorkingTodayRow`/`Response` → `WorkingNowRow`/`Response`, drop `dayOfWeek` | 3       |
| `apps/admin/lib/api.ts`                                  | `fetchWorkingToday` → `fetchWorkingNow`                                     | 3       |
| `apps/admin/app/(dashboard)/staff/page.tsx`              | Call site + JSDoc                                                           | 3       |
| `apps/admin/app/(dashboard)/staff/staff-console.tsx`     | Prop rename                                                                 | 3       |
| `apps/admin/app/(dashboard)/staff/whos-working-card.tsx` | Prop type + translation keys + JSDoc                                        | 3       |
| `packages/i18n/locales/en.json`, `ka.json`               | `workingToday.*` → `workingNow.*` + new copy                                | 3       |

---

### Task 1: `gymLocalNow` — the gym's clock

A pure, separately exported helper so the timezone rule can be tested without a Prisma mock. Nothing consumes it yet; Task 2 wires it in.

**Files:**

- Modify: `apps/api/src/staff/staff-depth.service.ts`
- Test: `apps/api/src/staff/staff-depth.service.spec.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `export function gymLocalNow(timeZone: string, instant?: Date): { dayOfWeek: number; time: string }` — `dayOfWeek` 0=Mon…6=Sun, `time` zero-padded `"HH:MM"`.

- [ ] **Step 1: Write the failing tests**

Append to the end of `apps/api/src/staff/staff-depth.service.spec.ts`:

```ts
describe('gymLocalNow', () => {
  // 2026-07-15 is a Wednesday. Asia/Tbilisi is UTC+4 year-round.
  it('reports the gym-local weekday and time, not the server’s', () => {
    expect(gymLocalNow('Asia/Tbilisi', new Date('2026-07-15T12:00:00Z'))).toEqual({
      dayOfWeek: 2,
      time: '16:00',
    });
  });

  it('rolls to the next weekday when the gym is already past midnight', () => {
    // 21:00 UTC Wednesday is 01:00 Thursday in Tbilisi.
    expect(gymLocalNow('Asia/Tbilisi', new Date('2026-07-15T21:00:00Z'))).toEqual({
      dayOfWeek: 3,
      time: '01:00',
    });
  });

  it('formats midnight as 00:00, never 24:00', () => {
    expect(gymLocalNow('Asia/Tbilisi', new Date('2026-07-15T20:00:00Z'))).toEqual({
      dayOfWeek: 3,
      time: '00:00',
    });
  });

  it('handles a zone west of UTC, where the gym is still on the previous day', () => {
    // 02:00 UTC Wednesday is 22:00 Tuesday in New York (EDT, UTC-4).
    expect(gymLocalNow('America/New_York', new Date('2026-07-15T02:00:00Z'))).toEqual({
      dayOfWeek: 1,
      time: '22:00',
    });
  });
});
```

Add `gymLocalNow` to the existing import on line 3 of the spec:

```ts
import { StaffDepthService, gymLocalNow } from './staff-depth.service';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @fit/api test src/staff/staff-depth.service.spec.ts`
Expected: FAIL — `gymLocalNow is not a function` (or a TS resolution error on the import).

- [ ] **Step 3: Implement the helper**

In `apps/api/src/staff/staff-depth.service.ts`, directly below the `STAFF_ROLES` constant (around line 28):

```ts
/** `Intl`'s `weekday: 'short'` names mapped to the app's 0 = Monday … 6 = Sunday convention. */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * The wall-clock weekday and time at a gym, as its schedule means them.
 *
 * `ShiftSlot` stores a weekday plus `"HH:MM"` strings with no zone attached, so
 * "is this shift running?" can only be answered against the gym's own clock —
 * reading the host's (`Date#getDay()`, `getHours()`) makes a UTC server serving
 * an `Asia/Tbilisi` gym four hours wrong, and a whole day wrong after 20:00
 * local. Both fields therefore come from a single zoned `formatToParts` call.
 *
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter leaves the cycle to
 * the locale, and an `h24` resolution renders midnight as `"24:00"`, which sorts
 * after every `endTime` and would empty the roster for an hour each night.
 *
 * `instant` is injectable so tests can pin a moment without fake timers.
 */
export function gymLocalNow(
  timeZone: string,
  instant: Date = new Date(),
): { dayOfWeek: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  const weekday = part('weekday');
  const dayOfWeek = WEEKDAY_INDEX[weekday];
  if (dayOfWeek === undefined) {
    throw new Error(`Unrecognised weekday "${weekday}" for time zone ${timeZone}`);
  }

  return { dayOfWeek, time: `${part('hour')}:${part('minute')}` };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @fit/api test src/staff/staff-depth.service.spec.ts`
Expected: PASS — all four new cases plus every pre-existing case in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/staff/staff-depth.service.ts apps/api/src/staff/staff-depth.service.spec.ts
git commit -m "feat(staff): read the gym's own weekday and clock time

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Filter the roster to the shift running now

The behaviour change. Names stay `getWorkingToday` / `working-today` for one more commit so `@fit/types` and `@fit/admin` are untouched and the monorepo stays green.

**Files:**

- Modify: `apps/api/src/staff/staff-depth.service.ts:386-413` (the `getWorkingToday` method)
- Test: `apps/api/src/staff/staff-depth.service.spec.ts` (the `StaffDepthService.getWorkingToday` describe block, lines 281-347)

**Interfaces:**

- Consumes: `gymLocalNow(timeZone, instant?)` from Task 1.
- Produces: `getWorkingToday()` now returns only currently-running shifts; its `WorkingTodayResponse` still carries `dayOfWeek` (dropped in Task 3).

- [ ] **Step 1: Extend the test setup to mock the gym**

In `apps/api/src/staff/staff-depth.service.spec.ts`, inside `setup()` (lines 35-51), add a `gym` model to both the object literal and its type assertion:

```ts
function setup(models?: Record<string, Record<string, unknown>>) {
  const client = {
    staffNote: make(models?.staffNote),
    staffTask: make(models?.staffTask),
    timeOffRequest: make(models?.timeOffRequest),
    shiftSlot: make(models?.shiftSlot),
    gymMember: make(models?.gymMember),
    user: make(models?.user),
    gym: make(models?.gym),
  } as unknown as {
    staffNote: ReturnType<typeof make>;
    staffTask: ReturnType<typeof make>;
    timeOffRequest: ReturnType<typeof make>;
    shiftSlot: ReturnType<typeof make>;
    gymMember: ReturnType<typeof make>;
    user: ReturnType<typeof make>;
    gym: ReturnType<typeof make>;
    $transaction: (cb: (tx: unknown) => unknown) => unknown;
  };
```

Then add a helper directly above the `StaffDepthService.getWorkingToday` describe block (line 281):

```ts
/** A gym whose stored settings pin the given time zone. */
function gymInZone(timezone: string): Record<string, unknown> {
  return { findUnique: vi.fn(() => Promise.resolve({ settings: { locale: { timezone } } })) };
}
```

- [ ] **Step 2: Replace the `getWorkingToday` describe block with the failing tests**

Replace lines 281-347 of the spec (the whole existing `describe('StaffDepthService.getWorkingToday', …)` block) with:

```ts
describe('StaffDepthService.getWorkingToday', () => {
  const shiftRow = {
    staffId: 'gm-9',
    startTime: '10:00',
    endTime: '18:00',
    location: 'Branch 1',
    staff: { role: 'TRAINER', user: { name: 'Nino Trainer', email: 'nino@x.com' } },
  };

  it('asks only for the shift running now, in the gym’s zone', async () => {
    // 08:00 UTC Wednesday is 12:00 Wednesday in Tbilisi → weekday 2, "12:00".
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T08:00:00Z'));
    try {
      const { service, client } = setup({
        gym: gymInZone('Asia/Tbilisi'),
        shiftSlot: { findMany: vi.fn(() => Promise.resolve([shiftRow])) },
      });

      const result = await service.getWorkingToday();

      const where = client.shiftSlot.findMany.mock.calls[0]![0].where as {
        dayOfWeek: number;
        startTime: { lte: string };
        endTime: { gt: string };
        staff: { status: string };
      };
      expect(where.dayOfWeek).toBe(2);
      expect(where.startTime).toEqual({ lte: '12:00' });
      expect(where.endTime).toEqual({ gt: '12:00' });
      expect(where.staff.status).toBe('ACTIVE');
      expect(result.dayOfWeek).toBe(2);
      expect(result.shifts).toEqual([
        {
          staffId: 'gm-9',
          name: 'Nino Trainer',
          role: 'TRAINER',
          startTime: '10:00',
          endTime: '18:00',
          location: 'Branch 1',
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves the weekday from the gym’s zone, not the server’s', async () => {
    // 21:00 UTC Wednesday is already 01:00 Thursday in Tbilisi → weekday 3.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T21:00:00Z'));
    try {
      const { service, client } = setup({ gym: gymInZone('Asia/Tbilisi') });

      await service.getWorkingToday();

      const where = client.shiftSlot.findMany.mock.calls[0]![0].where as {
        dayOfWeek: number;
        startTime: { lte: string };
      };
      expect(where.dayOfWeek).toBe(3);
      expect(where.startTime).toEqual({ lte: '01:00' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the platform default zone when a gym has never saved settings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T08:00:00Z'));
    try {
      const { service, client } = setup({
        gym: { findUnique: vi.fn(() => Promise.resolve({ settings: null })) },
      });

      await expect(service.getWorkingToday()).resolves.toBeDefined();

      // Asia/Tbilisi is the default, so 08:00 UTC is still 12:00 local.
      const where = client.shiftSlot.findMany.mock.calls[0]![0].where as {
        startTime: { lte: string };
      };
      expect(where.startTime).toEqual({ lte: '12:00' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the email when a staff member has no name', async () => {
    const { service } = setup({
      gym: gymInZone('Asia/Tbilisi'),
      shiftSlot: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              staffId: 'gm-3',
              startTime: '08:00',
              endTime: '12:00',
              location: null,
              staff: { role: 'RECEPTIONIST', user: { name: null, email: 'front@desk.io' } },
            },
          ]),
        ),
      },
    });

    const { shifts } = await service.getWorkingToday();
    expect(shifts[0]!.name).toBe('front@desk.io');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @fit/api test src/staff/staff-depth.service.spec.ts`
Expected: FAIL — the first test errors because `where.startTime` is `undefined` (the query has no time bounds yet).

- [ ] **Step 4: Implement the filtered query**

In `apps/api/src/staff/staff-depth.service.ts`, replace the whole `getWorkingToday` method (lines 374-413, JSDoc included) with:

```ts
  /**
   * Everyone on shift **right now** (`GET /staff/working-today`) — the roster
   * behind the on-shift card. Reads the gym's weekly {@link ShiftSlot} schedule
   * for the current weekday and keeps only the slots whose window contains the
   * current time, joined to each staff member's display name and role so the
   * card renders without a second lookup. Only `ACTIVE` staff memberships are
   * returned, ordered by start time. Tenant-scoped, so it only ever sees the
   * caller's gym.
   *
   * Both the weekday and the time come from the gym's configured zone via
   * {@link gymLocalNow} — a schedule written as "Wednesday 09:00–17:00" means
   * the gym's Wednesday, not the host's. `startTime` is inclusive and `endTime`
   * exclusive, so back-to-back shifts hand over with neither gap nor overlap.
   */
  async getWorkingToday(): Promise<WorkingTodayResponse> {
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
        staffId: true,
        startTime: true,
        endTime: true,
        location: true,
        staff: { select: { role: true, user: { select: { name: true, email: true } } } },
      },
      orderBy: [{ startTime: 'asc' }],
    });
    return {
      dayOfWeek,
      shifts: shifts.map((row) => ({
        staffId: row.staffId,
        name: row.staff.user.name ?? row.staff.user.email,
        role: row.staff.role as StaffRole,
        startTime: row.startTime,
        endTime: row.endTime,
        location: row.location,
      })),
    };
  }
```

Add `gymSettingsStoredSchema` to the `@fit/types` import block at the top of the file — it is a value, so it goes with `staffRolePermissionMatrix` above the `type` imports:

```ts
import {
  gymSettingsStoredSchema,
  staffRolePermissionMatrix,
  type CreateStaffNoteInput,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @fit/api test src/staff/staff-depth.service.spec.ts`
Expected: PASS — all four cases in the block.

- [ ] **Step 6: Verify nothing else in the API regressed**

Run: `pnpm --filter @fit/api test && pnpm --filter @fit/api type-check`
Expected: PASS both.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/staff/staff-depth.service.ts apps/api/src/staff/staff-depth.service.spec.ts
git commit -m "fix(staff): show only the shift that is running now

The card listed everyone rostered at any point today, so a trainer who
left at noon sat beside one still on the floor. Bound the query to the
current time, and take both the weekday and the time from the gym's
configured zone — a UTC host serving an Asia/Tbilisi gym was already
returning the previous day's roster after 20:00 local.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rename today → now, end to end

Mechanical rename plus the copy change. Touches three packages at once; `pnpm type-check` at the repo root is what proves no call site was missed.

**Files:**

- Modify: `packages/types/src/staff-depth.ts:227-250`
- Modify: `apps/api/src/staff/staff-depth.service.ts` (method name, JSDoc, type import)
- Modify: `apps/api/src/staff/staff-depth.controller.ts:182-194` + type import on line 34
- Modify: `apps/api/src/staff/staff-depth.service.spec.ts` (describe + call sites)
- Modify: `apps/admin/lib/api.ts:118` and `:1413-1420`
- Modify: `apps/admin/app/(dashboard)/staff/page.tsx:12,93,107,110,119`
- Modify: `apps/admin/app/(dashboard)/staff/staff-console.tsx:6,168,175,230`
- Modify: `apps/admin/app/(dashboard)/staff/whos-working-card.tsx:6,136-137,142,152,155,162`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `getWorkingToday()` from Task 2.
- Produces: `GET /staff/working-now` → `WorkingNowResponse { shifts: WorkingNowRow[] }`; `fetchWorkingNow()`; `WhosWorkingCard({ shifts: WorkingNowRow[] })`; translation namespace `admin.staff.workingNow`.

- [ ] **Step 1: Rename the shared types**

In `packages/types/src/staff-depth.ts`, replace lines 227-250 with:

```ts
/**
 * One staff member on shift right now, as the on-shift card renders it.
 * A denormalised {@link ShiftSlotRow} + the staff member's display name and role,
 * so the card needs no second lookup. `staffId` is the membership id.
 */
export interface WorkingNowRow {
  staffId: string;
  name: string;
  role: StaffRole;
  startTime: string;
  endTime: string;
  location: string | null;
}

/**
 * Successful `GET /staff/working-now` response — every staff member whose weekly
 * schedule places them on shift at this moment, in the gym's own time zone,
 * ordered by start time.
 */
export interface WorkingNowResponse {
  shifts: WorkingNowRow[];
}
```

Note `dayOfWeek` is gone from the response: it existed so the card could label itself "today", and nothing reads it.

- [ ] **Step 2: Rename through the API**

In `apps/api/src/staff/staff-depth.service.ts`:

- change the type import `type WorkingTodayResponse,` → `type WorkingNowResponse,`
- rename the method `async getWorkingToday(): Promise<WorkingTodayResponse>` → `async getWorkingNow(): Promise<WorkingNowResponse>`
- in its JSDoc, change ``(`GET /staff/working-today`)`` → ``(`GET /staff/working-now`)``
- delete `dayOfWeek,` from the returned object literal (the local `const { dayOfWeek, time }` destructuring stays — `dayOfWeek` is still used in the `where`)

In `apps/api/src/staff/staff-depth.controller.ts`:

- line 34: `type WorkingTodayResponse,` → `type WorkingNowResponse,`
- replace lines 182-194 with:

```ts
  // -- Working now ----------------------------------------------------------

  /**
   * `GET /staff/working-now` — the gym's staff on shift at this moment, behind
   * the "Who's Working Now" card. A static segment, so it never collides with
   * the `:staffId/schedule` route above.
   */
  @Get('working-now')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async getWorkingNow(): Promise<WorkingNowResponse> {
    return this.staff.getWorkingNow();
  }
```

In `apps/api/src/staff/staff-depth.service.spec.ts`:

- rename the describe to `'StaffDepthService.getWorkingNow'`
- rename all four `service.getWorkingToday()` calls to `service.getWorkingNow()`
- delete the `expect(result.dayOfWeek).toBe(2);` assertion in the first test (the field no longer exists on the response; `expect(where.dayOfWeek).toBe(2)` stays)

- [ ] **Step 3: Rename through the admin console**

`apps/admin/lib/api.ts` — line 118 in the type import block: `WorkingTodayResponse,` → `WorkingNowResponse,`; then replace lines 1413-1420 with:

```ts
/** The gym's staff on shift right now — behind the "Who's Working Now" card. */
export async function fetchWorkingNow(): Promise<WorkingNowResponse> {
  const res = await fetch(`${apiBaseUrl()}/staff/working-now`, {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  return unwrap<WorkingNowResponse>(res);
}
```

`apps/admin/app/(dashboard)/staff/page.tsx` — `fetchWorkingToday,` → `fetchWorkingNow,` in the import (line 12); in the JSDoc (line 93) ``today's on-shift roster (`GET /staff/working-today`)`` → ``the on-shift-now roster (`GET /staff/working-now`)``; and in the body:

```ts
const [{ staff }, roles, workingNow, locations] = await Promise.all([
  fetchStaff(),
  fetchStaffRoles(),
  fetchWorkingNow(),
  fetchLocations({ status: 'ACTIVE', limit: 100 }),
]);
```

with the prop below changed to `workingNow={workingNow.shifts}`.

`apps/admin/app/(dashboard)/staff/staff-console.tsx` — line 6 type import `WorkingTodayRow` → `WorkingNowRow`; line 168 destructured prop `workingToday,` → `workingNow,`; line 175 `workingToday: WorkingTodayRow[];` → `workingNow: WorkingNowRow[];`; line 230 `<WhosWorkingCard shifts={workingToday} />` → `<WhosWorkingCard shifts={workingNow} />`.

`apps/admin/app/(dashboard)/staff/whos-working-card.tsx` — line 6 type import `WorkingTodayRow` → `WorkingNowRow`; replace the JSDoc + signature (lines 135-143) with:

```tsx
/**
 * The "Who's Working Now" card — the staff currently on shift, derived from the
 * gym's weekly schedule in its own time zone (`GET /staff/working-now`) and
 * rendered above the staff console. Each person shows their avatar initials,
 * name, role badge and shift hours; the header pill counts how many are on
 * shift. It is accurate as of page load and does not refresh on its own.
 */
export function WhosWorkingCard({ shifts }: { shifts: WorkingNowRow[] }) {
```

and change the three translation keys in the body: `t('workingToday.title')` → `t('workingNow.title')` (line 152), `t('workingToday.onShift', …)` → `t('workingNow.onShift', …)` (line 155), `t('workingToday.empty')` → `t('workingNow.empty')` (line 162).

- [ ] **Step 4: Rename and rewrite the copy**

In `packages/i18n/locales/en.json`, replace the `admin.staff.workingToday` object with:

```json
    "workingNow": {
      "title": "Who's Working Now",
      "onShift": "{count, plural, one {# on shift now} other {# on shift now}}",
      "empty": "No one is on shift right now."
    },
```

In `packages/i18n/locales/ka.json`, replace the `admin.staff.workingToday` object with:

```json
    "workingNow": {
      "title": "ვინ მუშაობს ახლა",
      "onShift": "{count, plural, one {ცვლაზეა # თანამშრომელი} other {ცვლაზეა # თანამშრომელი}}",
      "empty": "ახლა ცვლაზე არავინაა."
    },
```

Keep each object at the same position in the file its predecessor occupied, so the diff stays readable.

- [ ] **Step 5: Prove no call site was missed**

Run: `git grep -n "workingToday\|WorkingToday\|working-today"`
Expected: **no matches** anywhere outside `docs/`.

Then run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS all three. A missed rename surfaces here as a type error, which is the point of doing the rename as one commit.

- [ ] **Step 6: Verify in the running app**

The dev server should already be up (`pnpm dev`). If not, start it, then:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3002/admin/login
```

Sign in at `http://localhost:3002/admin/login` as `alex@example.com` / `Test1234!`, open `http://localhost:3002/admin/staff`, and confirm:

- the card reads **Who's Working Now**
- it lists only staff whose seeded shift window contains the current Tbilisi time
- with no one on shift, the empty line reads "No one is on shift right now."

To exercise both states, edit a staff member's schedule from the profile drawer so their window contains — then excludes — the current time, reloading the page between the two.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(staff): rename the on-shift card from today to now

The endpoint, types, translation keys and title all still said today
while the query means this moment. Rename them together, and drop
dayOfWeek from the response — it existed to label the card today and
nothing reads it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage**

| Spec section                                                     | Task                     |
| ---------------------------------------------------------------- | ------------------------ |
| `gymLocalNow`, `hourCycle: 'h23'`, weekday from the format call  | 1                        |
| `getWorkingNow` query, `lte`/`gt` bounds, settings fallback      | 2                        |
| Timezone-regression test, mid-shift test, email fallback         | 1, 2                     |
| Types + `fetchWorkingNow` + endpoint rename, `dayOfWeek` dropped | 3                        |
| en/ka copy                                                       | 3                        |
| UI rename only, `force-dynamic` untouched                        | 3                        |
| Error handling unchanged (page's existing try/catch)             | — no change required     |
| Out of scope: clock-in, overnight shifts, live refresh           | — not planned, by design |

**Placeholders:** none — every step carries its literal code or command.

**Type consistency:** `gymLocalNow` returns `{ dayOfWeek, time }` in Task 1 and is destructured as exactly that in Task 2. `WorkingNowRow` / `WorkingNowResponse` / `fetchWorkingNow` are introduced in Task 3 Step 1 and used under those names in Steps 2-3. `getWorkingNow` is named identically in the service, controller and spec.

**Known ordering property:** Tasks 1 and 2 leave the code correct but named "today"; Task 3 is what makes names and meaning agree. The branch is only presentable after Task 3.
