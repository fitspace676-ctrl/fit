# Services — design

**Date:** 2026-08-25 · **Status:** approved in chat, implementation in three stages

## Purpose

A gym sells things that are neither a membership, a class nor a product: a
personal-training hour, a massage, a body-composition test. Today none of these
has a home — the PT calendar knows a trainer's busy blocks but not a member, a
price or a bookable slot, and the POS can only ring up products and plans.

**Services** gives them one:

- staff create a _service_ (a Personal Trainer service bound to a trainer, or a
  custom one they name themselves) with an assigned staff member and a price;
- custom services carry a schedule (once / daily / weekly) that is expanded into
  bookable sessions; PT services get their sessions added by hand on the PT
  calendar, as open slots or already assigned to a member;
- members see services in the portal and book an open session;
- services are sold at the desk through the POS, and a sale attached to a member
  marks that member's booked session as paid.

Payment is always at the desk. There is no online payment for services.

## Decisions taken in brainstorming

| Question                                        | Decision                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| What does the admin add to the PT calendar?     | Both: open slots any member can book, and sessions already assigned to a member.                                   |
| What does a custom service's schedule mean?     | Sessions are generated from it; members see and book them from the portal.                                         |
| What happens when a service is sold in the POS? | Only a sale. No session is created from the till.                                                                  |
| How does a member pay for a booked session?     | At the desk, through the POS. Booking is free and creates an unpaid session.                                       |
| Where do PT open slots come from?               | The admin adds them by hand on the PT calendar (not derived from trainer availability).                            |
| Model shape                                     | New `Service` + new `ServiceSession`; the existing `PtSession` is left untouched and the PT calendar renders both. |

## Staging

Three PRs, each shippable on its own:

1. **Catalogue + POS** — `Service` model, admin API, the `/services` admin page
   (list + create/edit drawer), a Services tab in the POS with a sellable line.
2. **Sessions** — `ServiceSession` model, PT-calendar integration (open slot /
   assigned session), custom-schedule expansion into sessions.
3. **Portal** — member Services pages, booking, "My sessions", and the POS
   sale → "paid" link.

Permissions are reused, not added: the catalogue is gated like the Shop
(`ProductRead` / `ProductWrite`); sessions like the PT calendar
(`ClassRead` / `ClassWrite`); member endpoints on the member token.

## Data model (Prisma, `packages/db/prisma/schema.prisma`)

```prisma
enum ServiceType   { PERSONAL_TRAINING CUSTOM }
enum ServiceStatus { ACTIVE ARCHIVED }

model Service {
  id              String        @id @default(cuid())
  gymId           String
  type            ServiceType
  /// PT: generated server-side as "Personal training — {staff name}"; CUSTOM: entered.
  name            String
  /// The staff member who delivers it — any non-MEMBER GymMember. A PT service
  /// requires the staff member to have a trainerProfile.
  staffId         String
  priceMinor      Int
  currency        String
  durationMinutes Int           @default(60)
  description     String        @default("")
  /// CUSTOM only. { freq: ONCE|DAILY|WEEKLY, weekdays: [MO..SU], startDate: "YYYY-MM-DD",
  /// startTime: "HH:MM", until?: "YYYY-MM-DD" } — the classes-admin recurrence vocabulary.
  schedule        Json?
  status          ServiceStatus @default(ACTIVE)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  gym      Gym              @relation(fields: [gymId], references: [id], onDelete: Cascade)
  staff    GymMember        @relation("ServiceStaff", fields: [staffId], references: [id], onDelete: Restrict)
  sessions ServiceSession[]
  orderItems OrderItem[]

  @@index([gymId, status, type])
  @@map("services")
}

enum ServiceSessionStatus { OPEN BOOKED COMPLETED CANCELLED }
enum ServiceSessionSource { MANUAL SCHEDULE }

model ServiceSession {
  id          String               @id @default(cuid())
  gymId       String
  serviceId   String
  /// Snapshot of the service's staff at creation, so reassigning the service
  /// never moves an already-scheduled session.
  staffId     String
  /// null = an open slot any member may book.
  memberId    String?
  startsAt    DateTime
  endsAt      DateTime
  status      ServiceSessionStatus @default(OPEN)
  source      ServiceSessionSource @default(MANUAL)
  /// The POS order that paid for this session (stage 3).
  paidOrderId String?
  notes       String               @default("")
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt

  gym       Gym        @relation(fields: [gymId], references: [id], onDelete: Cascade)
  service   Service    @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  staff     GymMember  @relation("ServiceSessionStaff", fields: [staffId], references: [id], onDelete: Restrict)
  member    GymMember? @relation("ServiceSessionMember", fields: [memberId], references: [id], onDelete: SetNull)
  paidOrder Order?     @relation(fields: [paidOrderId], references: [id], onDelete: SetNull)

  /// Idempotent schedule expansion: one generated session per service per start.
  @@unique([serviceId, startsAt, source])
  @@index([gymId, startsAt])
  @@index([gymId, staffId, startsAt])
  @@index([gymId, memberId, startsAt])
  @@map("service_sessions")
}

model OrderItem {
  // …existing fields…
  /// The service sold on this line (POS). Null for product / plan / adjustment lines.
  serviceId String?
  service   Service? @relation(fields: [serviceId], references: [id], onDelete: SetNull)
}
```

`ServiceSession` ships in stage 2; the stage-1 migration adds only `Service`, the
two enums and `OrderItem.serviceId`. A service with sessions cannot be deleted —
it is archived (`Restrict`), so sales and sessions keep their history.

Deliberately absent: variants and stock (a service has neither), capacity above
one (a session is one member; a group service is a class), credit packs, online
payment, and any derivation of slots from trainer availability.

## Wire schemas (`packages/types/src/services-admin.ts`, `services-member.ts`)

- `serviceScheduleSchema` — `{ freq, weekdays, startDate, startTime, until? }`,
  reusing `recurrenceFreqSchema` / `recurrenceWeekdaySchema` from `classes-admin`;
  `WEEKLY` requires ≥ 1 weekday; `until ≥ startDate`.
- `createServiceSchema` — discriminated on `type`: `PERSONAL_TRAINING` has no
  `name` and no `schedule`; `CUSTOM` requires both. Shared: `staffId`,
  `priceMinor ≥ 0`, `durationMinutes` 15–480, `description ≤ 2000`.
- `updateServiceSchema` — the same fields, all optional; `type` immutable.
- `listAdminServicesQuerySchema` — `type?`, `status? (default ACTIVE)`,
  `staffId?`, `search?`, `page`, `limit`, `sort ∈ name|price|createdAt`, `dir`.
- `AdminService` wire shape — the row plus `staff: { id, name, photoUrl, isTrainer }`
  and, once stage 2 lands, `upcomingSessions: number`.
- `ServiceStaffOption` — `{ id, name, role, photoUrl, isTrainer }`.
- Stage 2: `listServiceSessionsQuerySchema` (`from`, `to`, `staffId?`, `serviceId?`),
  `createServiceSessionSchema` (`serviceId`, `startsAt`, `memberId?`, `notes?`),
  `assignServiceSessionSchema` (`memberId`), and `AdminServiceSession` (row +
  `service { id, name, type }`, `staff { id, name }`, `member { id, name } | null`).
- Stage 3: `MeService`, `MeServiceSession`, `bookServiceSessionSchema`
  (`idempotencyKey`).
- POS: `receiptLineSchema` and the `recordPosSaleSchema` line gain
  `serviceId: string | null | undefined`; the POS cart item gains `serviceId?`.

## API (`apps/api/src/services/`)

New `ServicesModule`, following the admin-controller conventions (tenant-scoped
Prisma, zod pipes, `{ data, total, page, limit }` list envelope, `ApiError`
codes).

### Stage 1 — catalogue (`ProductRead` / `ProductWrite`)

| Method | Path                                      | Behaviour                                                                                                                                                                                                |
| ------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/services`                         | Filtered, paginated list with the staff join.                                                                                                                                                            |
| POST   | `/admin/services`                         | Create. PT: name generated, staff must have a trainer profile (`422 SERVICE_STAFF_NOT_TRAINER`). CUSTOM: schedule required. Staff must be a non-MEMBER member of this gym (`422 SERVICE_STAFF_INVALID`). |
| PATCH  | `/admin/services/:id`                     | Edit any mutable field; a PT service's name is regenerated when its staff changes.                                                                                                                       |
| POST   | `/admin/services/:id/archive`, `/restore` | `ACTIVE` ↔ `ARCHIVED`. Archiving cancels nothing; future OPEN sessions of an archived service are hidden from the portal (stage 3) and shown muted in the calendar.                                      |
| GET    | `/admin/services/staff`                   | Staff picker source: non-MEMBER, ACTIVE `GymMember`s with `isTrainer`.                                                                                                                                   |

POS: `POST /orders/pos-sale` accepts a line with `serviceId`. `OrdersService`
writes `OrderItem.serviceId`, never touches stock for it, and derives the
invoice's `InvoiceType` (`PERSONAL_TRAINING` / `SERVICE`) from the service's
type when every line is a service, else the existing rule.

### Stage 2 — sessions (`ClassRead` / `ClassWrite`)

| Method | Path                                                  | Behaviour                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/service-sessions?from&to&staffId?&serviceId?` | Calendar feed.                                                                                                                                                                                                                                                                                             |
| POST   | `/admin/service-sessions`                             | `endsAt = startsAt + service.durationMinutes`; `status = memberId ? BOOKED : OPEN`; `staffId` snapshotted from the service. Overlap check on the same staff across `ServiceSession`, `PtSession` (via the trainer profile) and `ClassInstance` (where the staff member is the trainer) → `409 STAFF_BUSY`. |
| POST   | `/admin/service-sessions/:id/assign` `{ memberId }`   | `OPEN → BOOKED`.                                                                                                                                                                                                                                                                                           |
| POST   | `/admin/service-sessions/:id/release`                 | `BOOKED → OPEN`, clears `memberId` and `paidOrderId` (an already-paid session may not be released — `409 SESSION_PAID`).                                                                                                                                                                                   |
| POST   | `/admin/service-sessions/:id/cancel`, `/complete`     | Status transitions; cancelling a generated session keeps the row (so regeneration does not resurrect it).                                                                                                                                                                                                  |

**Schedule expansion** — `ServiceScheduleService.materialise(gymId, horizonDays = 56)`
expands every ACTIVE CUSTOM service's schedule into `SCHEDULE`-sourced sessions
inside the horizon, inserting only starts that do not yet exist (`createMany
skipDuplicates` on the unique key). Runs synchronously after create / edit of a
CUSTOM service and nightly via `@Cron` (the class-template pattern). Editing a
schedule deletes future `SCHEDULE` sessions that are still `OPEN` and no longer
match, and leaves `BOOKED` ones alone.

### Stage 3 — member (member token)

| Method | Path                                                 | Behaviour                                                                                                                                                                                     |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/me/services`                                       | ACTIVE services with staff, price, duration.                                                                                                                                                  |
| GET    | `/me/services/:id/sessions?from&to`                  | `OPEN` sessions of that service, future only.                                                                                                                                                 |
| POST   | `/me/service-sessions/:id/book` `{ idempotencyKey }` | Atomic `updateMany where status = OPEN` → `BOOKED` with the caller's `memberId`; 0 rows → `409 SESSION_TAKEN`. Repeat with the same key returns the existing booking.                         |
| POST   | `/me/service-sessions/:id/cancel`                    | Own session, `BOOKED → OPEN` (`memberId` cleared), only while `startsAt − now ≥ cancellationWindowHours` (gym setting, default 12) and the session is unpaid; otherwise `409 SESSION_LOCKED`. |
| GET    | `/me/service-sessions`                               | The caller's upcoming and past sessions.                                                                                                                                                      |

**POS → paid** — inside the pos-sale transaction, for each service line on a
sale attached to a member: the member's earliest `BOOKED` session of that
service with `paidOrderId = null` gets `paidOrderId = order.id` (one session per
unit of quantity). Best-effort: no matching session is not an error. The
response carries `paidSessions: [{ id, startsAt }]` so the POS can toast it.

## Admin UI (`apps/admin`)

### `/services` (stage 1) — modelled on `/shop`

- Header: title, subtitle, **New service** (`ProductWrite` only).
- Summary tiles: All · Personal training · Custom · Archived.
- Status tabs (Active · Archived), search, type filter — URL search params,
  server-rendered from `fetchAdminServices`.
- Rows: name, type badge, staff avatar + name, price (mono), duration, and for
  CUSTOM the schedule in words ("Every Mon, Wed · 18:00", "Daily · 09:00",
  "Once · 3 Sep 18:00"); row menu: Edit · Archive / Restore.
- **Service drawer** (create + edit; the `add-product-drawer` pattern on
  `@fit/ui-web` forms). Step 1 (create only): two large type cards. Step 2:
  name (CUSTOM), staff picker (PT: trainers only), price, duration, description;
  CUSTOM: start date + time, Once / Daily / Weekly segmented control, weekday
  chips for Weekly, optional Until.
- Empty state replaces the current placeholder.

### PT calendar (stage 2) — extends `classes/pt-calendar`

- The staff select lists trainers plus any staff member with an ACTIVE service.
- Two layers on the slot grid: `PtSession` blocks as today, and `ServiceSession`
  cards — OPEN (ink-50, dashed border, "Open slot"), BOOKED (lime, member name),
  paid (✓ badge), CANCELLED (muted).
- Click-to-create → drawer: service select → start time → optional member
  (`member-lookup`). Session click → Assign member · Release · Cancel · Complete.

### POS (stage 1, stage 3)

- `product-grid` gains a **Services** tab beside Products and Memberships; a card
  shows name, staff, price. Cart line = `{ serviceId, name, unitPrice, qty }`, no
  stock badge, quantity editable.
- Stage 3: after a member-attached sale the receipt step toasts "Session on
  {date} marked paid" per `paidSessions` entry.

## Member portal (`apps/web`, stage 3)

- Nav: **Services** (i18n `en` / `ka`).
- `/member/services`: cards — name, staff photo + name, price, duration,
  description.
- `/member/services/[id]`: the week slot grid (`WeekCalendar`) showing only OPEN
  future sessions; tap → booking modal → "Booked — pay at the front desk".
- `/member/account`: **My sessions** — upcoming sessions with Cancel (when
  allowed) and a Paid / Unpaid chip; past sessions below.

## Error handling

All errors are `ApiError` codes with a stable HTTP status; the admin and portal
map them to inline messages: `SERVICE_STAFF_NOT_TRAINER`, `SERVICE_STAFF_INVALID`,
`SERVICE_SCHEDULE_REQUIRED` (422); `STAFF_BUSY`, `SESSION_TAKEN`, `SESSION_PAID`,
`SESSION_LOCKED` (409); `SERVICE_ARCHIVED` (409, booking or selling an archived
service). Schedule expansion never throws to the caller — a failed nightly run
logs and retries the next night; the synchronous run after an edit surfaces its
error to the admin.

## Testing

- `packages/types`: schema round-trips (discriminated create, schedule rules).
- `apps/api`: unit specs per service (name generation, staff validation, overlap
  detection, atomic booking, schedule expansion idempotence and horizon, POS
  paid-link), plus one `services.int-spec.ts` against the test database for the
  create → expand → book → sell → paid chain.
- `apps/admin`: nav spec already guards the destination; component tests for the
  drawer's type switch and the schedule-in-words formatter; POS cart store test
  for a service line.
- `apps/web`: booking action test (taken slot → message), formatter tests.

## Out of scope

Online payment, capacity > 1, packages of sessions (credits), deriving slots from
trainer availability, staff self-service of their own calendar, reporting
(services appear in revenue through `InvoiceType` already).
