# PT Calendar — design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation

## Goal

Turn the Classes hub's **PT Calendar** tab from a placeholder (which links to
Schedule) into a working personal-training calendar: pick a trainer, see that
trainer's PT sessions on the same week/month/list calendar the Schedule tab uses,
and add 1:1 PT sessions the way classes are added.

## Scope (MVP)

In: schedule a 1:1 PT session (trainer + member + start + duration + optional
notes), view a trainer's sessions on the calendar, cancel / complete a session.

Out (later): PT package/credit integration (consuming a member's package
sessions), member-facing booking, recurring PT sessions, pricing.

## Data model

New `PtSession` model — a 1:1 session, distinct from `ClassInstance` (which always
sources from a class type or template; a PT session needs neither):

```
model PtSession {
  id        String         @id @default(cuid())
  gymId     String
  trainerId String
  memberId  String                 // User id (the member)
  startsAt  DateTime
  endsAt    DateTime
  status    InstanceStatus @default(SCHEDULED)   // reuse SCHEDULED/COMPLETED/CANCELED
  notes     String         @default("")
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  gym     Gym     @relation(fields: [gymId], references: [id], onDelete: Cascade)
  trainer Trainer @relation(fields: [trainerId], references: [id], onDelete: Cascade)
  member  User    @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@index([gymId, trainerId, startsAt])
  @@map("pt_sessions")
}
```

Reuses the existing `InstanceStatus` enum rather than adding a new one. A Prisma
migration adds the table + back-relations on `Gym`, `Trainer`, `User`.

## API (`apps/api`, guarded by `ClassWrite`)

- `GET /admin/pt-sessions?from&to&trainerId` — a trainer's sessions in `[from, to)`,
  ordered by `startsAt`. Returns each session with resolved trainer + member names.
- `POST /admin/pt-sessions` — body `{ trainerId, memberId, startsAt, durationMinutes, notes? }`;
  `endsAt = startsAt + durationMinutes`. Returns the created session.
- `POST /admin/pt-sessions/:id/cancel` — set status `CANCELED`.
- `POST /admin/pt-sessions/:id/complete` — set status `COMPLETED`.

Tenant-scoped Prisma client pins `gymId`. New `PtSessionsService` +
`AdminPtSessionsController`, wired into the classes module.

## Types (`@fit/types`)

`packages/types/src/pt-sessions-admin.ts`: `AdminPtSession` (row: id, trainer
{id,name}, member {id,name}, startsAt, endsAt, status, notes), the list query
schema (`from`, `to`, `trainerId`), the create schema (numbers coerced from the
form's strings, as the class-type schema does), and the list/detail response
types. Re-exported from the package index.

## Admin UI — PT Calendar tab

`apps/admin/app/(dashboard)/classes/pt-calendar/`:

- **Trainer selector** (required) at the top, its value in the URL (`?trainerId=`).
  No trainer chosen → empty state ("Select a trainer to view their PT calendar").
- **`PtCalendarBoard`** — a new client component mirroring the Schedule board's
  week/month/list layout and styling (reusing `schedule/week.ts` date helpers),
  rendering the trainer's PT sessions as cards showing **member name + time range**.
  Prev/next window navigation like Schedule. _We do not modify `ScheduleBoard`_ —
  it is tightly coupled to class occurrences (occupancy stream, booking drawer,
  class titles), so a dedicated board keeps that component regression-free.
- **"Add PT session"** button → slide-in drawer (like `AddClassDrawer`): member
  picker + date + time + duration + notes; trainer = the selected trainer.
- Clicking a session → detail with **Cancel** / **Complete** actions.

Server actions wrap the API calls (mirroring `class-type-actions.ts`). The member
picker is fed by the existing members roster API.

## Testing

- API: `pt-sessions.service.spec.ts` — create computes `endsAt`, list windows by
  `[from, to)` and trainer, cancel/complete transition status, tenant scoping.
- Type-check + lint across `@fit/types`, `@fit/api`, `@fit/admin`.

## Non-goals / risks

- No package-credit consumption yet (kept as a pure scheduling calendar).
- `ScheduleBoard` is intentionally not generalised; the two boards share styling
  conventions and `week.ts`, not a component.
