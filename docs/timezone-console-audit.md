# Console timezone audit

Scope: `apps/admin/app/(dashboard)/{packages,locations,staff,pos,shop,trainers,marketing,automation,payments}`. Based on `origin/main` (`2fc832dd`).

## Requirements and acceptance

1. Match the gym's data and the dates the client sees: render stored instants using the gym's IANA timezone, through the parent's `useGymTimeZone` / cached `getGymTimeZone` APIs.
2. Preserve calendar dates and UTC-keyed report buckets without an additional shift.
3. Audit native date formatters as well as shared formatters; update relevant existing component coverage.

Implementation is complete, but all three requirements are **not done** for verified acceptance: this worker is prohibited from running builds/tests or the app. `git diff --check` is the only executed check. The owner must integrate the timezone APIs and formatter support, then perform validation below.

## Callsite classification

Paths below are relative to the scoped dashboard directory. Each row covers every formatter display in that file.

| Callsite                                                                                                 | Meaning                                                                                                     | Treatment                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/packages-table.tsx` `formatDate(plan.createdAt)`                                               | Creation instant                                                                                            | Client gym zone passed to pure helper                                                                        |
| `packages/[id]/page.tsx` `formatDate(plan.createdAt)`                                                    | Creation instant                                                                                            | Server gym zone                                                                                              |
| `locations/[id]/page.tsx` `formatDate(location.createdAt)`                                               | Creation instant                                                                                            | Server gym zone                                                                                              |
| `staff/staff-table.tsx` `formatJoined(member.joinedAt)`                                                  | Membership/join instant                                                                                     | Client gym zone                                                                                              |
| `staff/staff-profile-drawer.tsx` `member.joinedAt`                                                       | Same join instant                                                                                           | Client gym zone                                                                                              |
| `staff/invites-table.tsx` `invite.createdAt`, both `invite.expiresAt` displays                           | Invitation creation and expiry instants                                                                     | Client gym zone                                                                                              |
| `pos/orders/page.tsx` `OrderRow` `order.createdAt`                                                       | Sale creation instant                                                                                       | Server gym zone passed as row prop                                                                           |
| `pos/orders/[id]/page.tsx` `order.createdAt`, `refund.createdAt`, `entry.at`                             | Sale, refund and status-history instants                                                                    | Server gym zone                                                                                              |
| `pos/reconciliation/page.tsx` `report.generatedAt`                                                       | Report generation instant                                                                                   | Server gym zone                                                                                              |
| `pos/reconciliation/page.tsx` business-date selector and report key                                      | UTC-keyed business-date bucket, separate from generation time                                               | Preserved unchanged; no formatter shift                                                                      |
| `shop/[id]/page.tsx` `formatDate(product.createdAt)`                                                     | Creation instant                                                                                            | Server gym zone                                                                                              |
| `shop/[id]/stock-panel.tsx` `dtf` for stock movements                                                    | Movement creation instants                                                                                  | Server gym zone                                                                                              |
| `trainers/[id]/page.tsx` `formatDate(trainer.createdAt)`                                                 | Creation instant                                                                                            | Replace native locale formatter with shared formatter and gym zone                                           |
| `trainers/[id]/page.tsx` `formatHired(trainer.hiredAt)`                                                  | Creation instant, not a date-only hire field                                                                | Same; API maps hiredAt from createdAt (`admin-trainers.service.ts`), documented in `types/trainers-admin.ts` |
| `trainers/format.ts` `formatNextClass` weekday                                                           | Already transformed gym day (`zonedToday`)                                                                  | Keep explicit UTC to avoid a second shift; time already uses gym zone                                        |
| `trainers/format.ts` `formatClassDateTime` day                                                           | Already transformed gym day (`zonedToday`)                                                                  | Keep explicit UTC; time already uses gym zone                                                                |
| `marketing/campaigns-view.tsx` `formatDateTime(when)`, `formatDate(c.createdAt)` via `marketing-meta.ts` | Campaign sent/scheduled and creation instants                                                               | Client gym zone                                                                                              |
| `marketing/banners/banners-view.tsx` `banner.startsAt`, `banner.endsAt` via `marketing-meta.ts`          | Activation/expiry instants                                                                                  | Client gym zone                                                                                              |
| `marketing/promo-codes-view.tsx` `p.expiryDate` via `marketing-meta.ts`                                  | Expiry instant despite date-like field name; schema is datetime and eligibility compares epoch milliseconds | Client gym zone                                                                                              |
| `automation/automation-view.tsx` `rule.createdAt` via `automation-meta.ts`                               | Creation instant                                                                                            | Client gym zone                                                                                              |
| `payments/[id]/page.tsx` `formatDate(plan.createdAt)`                                                    | Plan creation instant                                                                                       | Server gym zone                                                                                              |
| `payments/invoices/invoices-table.tsx` `invoice.issuedAt`, `invoice.dueDate` via `invoices/format.ts`    | Due date is calendar-only; issue date mixes manual calendar days and automatic instants                     | Preserve explicit UTC; mixed issue semantics unresolved                                                      |

No other `createDateTimeFormat`, `formatDate`, `formatTime`, or native Intl instant-display callsites were found in the assigned subdirectories. Clock-only opening hours/availability are not instants and remain unchanged.

## Ambiguities and follow-up boundaries

- Banner and promotion editors collect date inputs but currently convert boundaries using the browser's local timezone. Their stored values are real instants, so display now truthfully uses the gym zone. Input parsing/round-tripping remains a separate issue; if the viewer and gym zones differ, editing can still move a boundary. Campaign scheduling input handling also remains outside this display audit.
- Invoice `issuedAt` is ambiguous: manual explicit issue days are anchored to UTC midnight by admin-invoices.service.ts, but invoice.service.ts defaults omitted issue dates to real instants. The payload does not distinguish them. Preserve UTC consistently across roster/member/web to protect entered calendar days; automatic issue instants remain an unresolved exception. Due dates are calendar-only.
- Reconciliation's UTC date key and default `todayIso()` are deliberately unchanged; changing report bucketing requires agreement with the API.

## Owner validation

- Integrate with the parent's `@/components/gym-timezone`, `@/lib/gym-locale`, and explicit-zone formatter support before running checks.
- Run admin type-check, lint/build and relevant tests. Existing `staff/staff-console.test.tsx` now mocks Asia/Tbilisi and includes a UTC-month-boundary join-date assertion. It was **not run**.
- Run existing trainer format and invoice table tests to verify preserved wall-day/calendar-date behavior.
- In the running app, inspect a record near UTC midnight in staff, POS history/refunds, stock movements, campaign times, trainer creation, and plan creation with a gym zone different from the browser; verify date-only invoice/report days do not move.
- Worker result: **not built**, no tests run, no running-app verification.
