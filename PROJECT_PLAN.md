# Fit - Project Plan

*Generated: 2026-07-03*
*Milestone: FormaCore Redesign & Completion*
*Design reference: https://design.planflow.tools/d/6MfRKxx4LyI1 ("formacore")*

## Overview

**Project Name**: Fit

**Description**: Multi-tenant SaaS platform for gyms and fitness centers in Georgia (Tbilisi first).
Turborepo monorepo — Next.js 15 (platform, superadmin, tenant web, tenant admin), NestJS API,
Expo mobile app, PostgreSQL/Prisma, Redis, Cloudflare R2; deployed on Vercel + Railway.

**This milestone**: Rebuild the **admin console** and **member (user) dashboard** to the
formacore design (https://design.planflow.tools/d/6MfRKxx4LyI1) — 18 admin screens, 8 member-web screens, 9 mobile
screens, light + dark — and close the backend gaps the redesigned screens expose
(subscription enrollment, renewal billing, invoices, notifications, live updates), then take
a pilot gym live.

This plan replaces the previous 108-task build plan. It was written against a **ground-truth
audit of the codebase** (2026-07-03), not against the old plan's claims.

---

## Where the codebase actually stands (audit summary, 2026-07-03)

**Solid and shipped** (verified in code, not just claimed):

- Tenancy + RBAC: subdomain + JWT tenant resolution, tenant-scoped Prisma extension,
  deny-by-default `PermissionsGuard`, CI check that every controller declares a policy.
- Auth: email/password + verification, refresh-token rotation, Google + Apple OAuth,
  staff invites, gym provisioning (`register-gym`), SuperAdmin console with audited impersonation.
- Classes & booking: templates with recurrence, generated instances, atomic capacity gate,
  real waitlist with promotion, attendance, reviews.
- Commerce: products with variants/gallery/stock, cart (guest + authed), orders with status
  timeline, refunds, POS payments (cash/card/member account), reconciliation, CSV export.
- Credit packs: purchase, FIFO draw inside the booking transaction, refund on cancel.
- Check-in: `CheckIn` model, reception feed, eligibility (subscription/credit gated), KPI stats.
- Analytics + dashboard endpoints; audit log; R2 signed uploads.
- 27 Prisma models, 29 migrations; ~95 test files (69 unit + 9 integration in the API);
  CI with real Postgres/Redis integration job.
- **Already redesigned to formacore** (PRs #120–#131): admin shell, dashboard, analytics,
  members list/detail, trainers list/detail, check-in screen, member portal (home, classes,
  trainers, bookings, shop, cart/checkout, profile), platform landing, design tokens + themes.

**The gaps this plan closes:**

1. **Subscription enrollment does not exist** — only the seed creates `Subscription` rows;
   no API path enrolls a member. Freeze/unfreeze is the only live subscription operation.
2. **No renewal/billing job** — referenced in code comments, never built. No scheduler,
   no BullMQ anywhere.
3. **No trial support** — no trial fields in the schema (the old plan's "T8.6 in progress"
   does not exist in code).
4. **Invoices don't exist** — `me-subscription` hardcodes `invoices: []`; no Invoice model.
5. **Notifications = push-token registration only** — no send path, no inbox, no templates.
6. **No realtime** — no gateway, no socket clients; reception board polls.
7. **Payments are a string tag** (`"pos"` / `"stub"`) — no provider interface; online checkout
   trusts the stub.
8. **11 admin screens not yet on the new design**: schedule, activity, billing-plans(+edit),
   locations, orders, pos, reports, settings, shop, staff.
9. **Mobile app not redesigned**; superadmin is a near-skeleton; platform lead forms are
   frontend-only placeholders.

---

## Non-Goals (unchanged this milestone)

- No real payment-provider charges (interface + stub only; Stripe/TBC/BOG is the next milestone).
- No card-present terminal hardware; no multi-currency (GEL only).
- No third-party aggregator sync, public API/webhooks, white-label domains.
- No platform (SaaS) billing — gyms stay on trial/free tier.
- No marketing/CRM campaign engine; transactional messages only.
- No native in-app purchases.

---

## Task ID convention

Task IDs `T<phase>.<n>` map 1:1 to the PlanFlow project slots (T1.1–T10.10, 108 tasks).
Statuses below reflect the audit: `[x]` = verified shipped, otherwise TODO/IN_PROGRESS as marked.

---


## Phase 1: Design System Foundation

**Goal**: Port the formacore design system (tokens, primitives, kits) into packages/ui-web and packages/ui-mobile so every screen is built from one shared library, with light/dark theming.

**Progress**: 6 / 12 done

### T1.1: Port formacore design tokens into packages/ui-web

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Description**: Colors, typography, spacing, radius and the reference gradient extracted from the formacore design (get_design_tokens) into Tailwind config + CSS variables. Shipped with #120/#125.

### T1.2: Light/dark theme infrastructure

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.1
- **Description**: Theme switching without FOUC across admin and member portal; every formacore screen has a light and dark variant. Shipped with the FormaCore redesign (#120).

### T1.3: Core UI primitives per design system

- [ ] **Status**: IN_PROGRESS
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T1.1
- **Description**: Button, Badge, Card, Input, Select, Tabs, Avatar matching design-system.tsx from the formacore design. Partially exists from redesigned screens — consolidate into packages/ui-web instead of per-app copies.

### T1.4: Data-table kit (sortable, paginated, filter bar)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T1.3
- **Description**: One reusable table component matching the formacore list screens (members, orders, staff, shop) — server-side pagination, sort headers, filter chips, empty/loading/skeleton states.

### T1.5: Chart kit styled per design

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.1
- **Description**: Recharts wrappers (area, bar, donut, sparkline) with formacore palette and tooltip styling. Shipped with the analytics screen (#128) and dashboard rebuild (#129).

### T1.6: Modal / drawer / toast kit

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.3
- **Description**: Shared overlay components (confirm dialogs, side drawers for detail panes, toast notifications) matching the formacore design, replacing ad-hoc per-screen modals.

### T1.7: Form kit (react-hook-form + zod styled fields)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.3
- **Description**: Field wrappers, validation error styling, section layouts for the edit screens (billing-plan-edit, settings, product editor) per the formacore forms.

### T1.8: AdminShell (sidebar + topbar) per design

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.1
- **Description**: Admin console shell with formacore sidebar navigation, topbar and page chrome. Shipped with #120/#124 (every console page renders inside AdminShell).

### T1.9: Member portal shell per design

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.1
- **Description**: Member-facing portal shell (nav, footer, page chrome) matching the formacore Member App pages. Shipped with the FormaCore redesign (#120).

### T1.10: Mobile design tokens + base components (ui-mobile)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T1.1
- **Description**: NativeWind tokens and base components (buttons, cards, list rows, tab bar) mirroring the formacore Mobile page so Expo screens can be rebuilt to match.

### T1.11: i18n coverage for redesigned UI (ka/en)

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 4h
- **Description**: Every string introduced by the redesign goes through packages/i18n with ka and en messages; no hardcoded copy in the new components.

### T1.12: Platform marketing page per design (platform.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.1
- **Description**: apps/platform landing matching the formacore Marketing page (marquee, contact, gradient). Shipped with #118/#125; lead-modal backend wiring tracked separately in T8.2.


---


## Phase 2: Admin Console — Core Screens

**Goal**: The operational heart of the admin console rebuilt to the formacore Admin pages: dashboard, analytics, members, trainers, check-in, staff, locations, settings.

**Progress**: 9 / 12 done

### T2.1: Admin dashboard per design (dashboard.tsx)

- [x] **Status**: DONE
- **Complexity**: High · **Estimate**: 8h
- **Depends on**: T1.8
- **Description**: KPI tiles, occupancy, revenue snapshot and activity summary matching the formacore dashboard artboard, backed by /dashboard/stats. Shipped with #129.

### T2.2: Analytics backend (/admin/analytics)

- [x] **Status**: DONE
- **Complexity**: High · **Estimate**: 8h
- **Description**: Range-filtered revenue/attendance/churn KPIs, time series, channel and plan mix, top classes. Shipped with #128.

### T2.3: Analytics screen per design (analytics.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T2.2, T1.5
- **Description**: Admin analytics screen matching the formacore analytics artboard, wired to the analytics endpoint. Shipped with #128.

### T2.4: Members list per design (members.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T1.8
- **Description**: Member roster with status buckets (active/frozen/trial/expired), search and plan cell matching the formacore members artboard, on real data. Shipped with #131.

### T2.5: Member detail per design (members-detail.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T2.4
- **Description**: Member profile with tabs (overview, bookings, purchases, notes) matching the formacore member-detail artboard. Shipped with #131.

### T2.6: Trainers list per design (trainers.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.8
- **Description**: Trainer roster cards/table matching the formacore trainers artboard, on real data. Shipped with #130.

### T2.7: Trainer detail per design (trainers-detail.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T2.6
- **Description**: Trainer profile with schedule and reviews matching the formacore trainer-detail artboard. Shipped with #130.

### T2.8: Check-in backend (eligibility + feed + stats)

- [x] **Status**: DONE
- **Complexity**: High · **Estimate**: 8h
- **Description**: /admin/check-ins: record arrivals, today's feed, KPI stats, per-member eligibility gated on subscription/credits. CheckIn model + migration. Shipped with #126.

### T2.9: Check-in reception screen per design (check-in.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T2.8
- **Description**: Reception board matching the formacore check-in artboard: search, eligibility badge, arrival feed. Shipped with #126.

### T2.10: Staff screen per design (staff.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.4
- **Description**: Rebuild the staff management screen (invites, roles, remove) to match the formacore staff artboard using the shared table + modal kits. Backend already exists.

### T2.11: Locations screen per design (locations.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.7
- **Description**: Rebuild locations CRUD (hours, amenities) to match the formacore locations artboard. Backend already exists.

### T2.12: Settings screen per design (settings.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.7
- **Description**: Rebuild gym settings (brand, locale, business hours, notification sender) to match the formacore settings artboard using the form kit. Backend already exists.


---


## Phase 3: Admin Console — Schedule & Activity

**Goal**: The class schedule calendar and the live activity surface, matching schedule.tsx and activity.tsx.

**Progress**: 0 / 11 done

### T3.1: Schedule week-view backend (instances + occupancy)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Description**: Week-range endpoint returning class instances with booked/capacity, trainer and location, shaped for the formacore schedule calendar.

### T3.2: Schedule screen per design (schedule.tsx)

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 10h
- **Depends on**: T3.1, T1.3
- **Description**: Admin week calendar matching the formacore schedule artboard: day columns, class cards with occupancy, filters by trainer/location, week navigation.

### T3.3: Class instance drawer (detail + roster + quick actions)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T3.2, T1.6
- **Description**: Clicking a class opens a drawer with the booking roster, capacity bar, cancel/edit actions per the formacore design.

### T3.4: Recurrence editor restyle per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T3.2
- **Description**: Restyle the existing class template recurrence editor to the formacore form patterns; keep the RRULE round-trip behavior.

### T3.5: Attendance marking from schedule

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T3.3
- **Description**: Mark attended/no-show inline from the class roster drawer; reuses the existing attendance endpoints.

### T3.6: Waitlist management UI

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T3.3
- **Description**: Waitlist ordering and manual promote from the class drawer; backend waitlist + promotion already exists in bookings.service.

### T3.7: Admin books a member onto a class

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T3.3
- **Description**: Front-desk flow: search member from the class drawer and create a booking on their behalf, honoring capacity/credit rules.

### T3.8: Activity feed backend (unified event stream)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Description**: Aggregate signups, bookings, check-ins, sales and subscription events into one queryable feed powering activity.tsx (derive from existing tables + AuditLog; no new write paths).

### T3.9: Activity screen per design (activity.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T3.8, T1.4
- **Description**: Admin activity screen matching the formacore activity artboard: filterable event stream with type icons and relative times.

### T3.10: Audit log restyle + merge under Activity

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T3.9
- **Description**: Fold the existing audit-log viewer into the activity area as a tab, styled to the formacore patterns.

### T3.11: Dashboard + check-in live refresh (polling)

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T3.8
- **Description**: Short-interval refetch of dashboard KPIs, activity feed and reception board so front-desk screens feel live (upgraded to push in T8.9/T8.10).


---


## Phase 4: Admin Console — Commerce Screens

**Goal**: POS, orders, shop catalog and reports rebuilt to the formacore commerce artboards.

**Progress**: 0 / 11 done

### T4.1: POS screen per design (pos.tsx)

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 10h
- **Depends on**: T1.3
- **Description**: Rebuild the POS to match the formacore pos artboard: product grid + search, cart pane, member lookup, cash/card/member-account payment modal. Backend (orders/payments) already exists.

### T4.2: POS reconciliation restyle

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T4.1
- **Description**: Restyle the end-of-day cash count screen to formacore patterns; keep existing logic.

### T4.3: Orders list per design (orders.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.4
- **Description**: Orders table matching the formacore orders artboard: channel/status filters, totals, CSV export (export route already exists).

### T4.4: Order detail + refunds per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T4.3, T1.6
- **Description**: Order detail with status timeline (OrderStatusEvent) and full/partial refund flow restyled to the formacore design. Backend exists.

### T4.5: Shop catalog screen per design (shop.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T1.4
- **Description**: Admin product catalog matching the formacore shop artboard: grid with stock badges, category filters, low-stock surfacing.

### T4.6: Product editor per design (variants, gallery, stock)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T4.5, T1.7
- **Description**: Product create/edit with variants, image gallery and stock thresholds restyled to the formacore form patterns. Backend exists.

### T4.7: Inventory & low-stock view

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T4.5
- **Description**: Low-stock list and stock adjustment entry point per the design; reuses existing low-stock backend.

### T4.8: Reports backend (definitions + CSV/XLSX export)

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 8h
- **Description**: Report endpoints (revenue by channel, attendance by trainer/class, membership growth, no-show rate) with streaming CSV/XLSX export, powering reports.tsx.

### T4.9: Reports screen per design (reports.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T4.8, T1.5
- **Description**: Reports hub matching the formacore reports artboard: report cards, date-range presets, run + download.

### T4.10: Scheduled report delivery (email)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T4.8
- **Description**: Weekly/monthly report emails to owner/manager using the notification pipeline (T8.x) once available.

### T4.11: Commerce polish: receipts + export consistency

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T4.3
- **Description**: Align receipt emails and CSV exports with the redesigned branding; verify totals reconcile with Payment/Order tables.


---


## Phase 5: Billing — Subscriptions End-to-End

**Goal**: Close the biggest backend gap: members can actually subscribe, renew, and see invoices. Billing plan screens match billing-plans.tsx / billing-plan-edit.tsx.

**Progress**: 0 / 12 done

### T5.1: Billing plans screen per design (billing-plans.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.4
- **Description**: Plan list with pricing, interval, perks and subscriber counts matching the formacore billing-plans artboard. Plan CRUD backend exists.

### T5.2: Billing plan edit per design (billing-plan-edit.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T5.1, T1.7
- **Description**: Plan create/edit form (price, interval, credits, freeze allowance, perks) matching the formacore billing-plan-edit artboard.

### T5.3: Subscription enrollment API

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 10h
- **Description**: The missing core: POST endpoint that creates a member Subscription from a plan (admin-initiated and member checkout), with proration-free start, period computation and payment record. Today only the seed creates subscriptions.

### T5.4: Renewal & billing-cycle job

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 10h
- **Depends on**: T5.3
- **Description**: Scheduled job (BullMQ or @nestjs/schedule) advancing currentPeriodEnd, charging via the payment provider abstraction, idempotent per period — referenced in code comments but never built.

### T5.5: Past-due dunning & retries

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T5.4
- **Description**: Failed-charge retry ladder (+2/+5/+7 days) then EXPIRED/CANCELED; PAST_DUE surfaced in admin members list and member portal.

### T5.6: Trial support

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T5.3
- **Description**: trialDays on SubscriptionPlan, TRIAL status on enrollment, auto-convert on first charge, cancel-during-trial charges nothing. No trial fields exist in the schema today.

### T5.7: Freeze/unfreeze UI (admin + member)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.6
- **Description**: Surface the existing freeze backend (allowance, 422 EXCEEDS_FREEZE_ALLOWANCE) in the member-detail admin screen and member membership page per the design.

### T5.8: Credit-pack purchase & balance UI

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.3
- **Description**: Credit pack purchase and remaining-balance display in admin member detail and member portal; FIFO draw backend already exists.

### T5.9: Invoice model + numbered generation

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T5.4
- **Description**: Invoice + per-gym sequential numbering created on enrollment/renewal/POS-linked subscription charges; me-subscription currently hardcodes invoices: [].

### T5.10: Invoice list + PDF download

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T5.9
- **Description**: Member membership page and admin member detail show invoice history with PDF download stored in R2.

### T5.11: Payment provider abstraction hardening

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T5.3
- **Description**: Formal PaymentProvider interface behind a DI token with the stub as one implementation (hard-disabled in prod), webhook entry point, ADR for Stripe/TBC-BOG plug-in later. Today provider is a string tag ('pos'/'stub') on Payment.

### T5.12: Member membership page — full data per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T5.3, T5.10
- **Description**: member-membership.tsx to parity: live plan + status, next billing date, freeze action, credit balance, invoice history — replacing today's partially-stubbed data.


---


## Phase 6: Member Web Portal per Design

**Goal**: The member-facing web portal matches the formacore Member App pages exactly; close remaining parity + notification gaps.

**Progress**: 7 / 10 done

### T6.1: Member home per design (member-home.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.9
- **Description**: Member portal home matching the formacore member-home artboard. Shipped with the FormaCore redesign (#120).

### T6.2: Member classes + class detail per design

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T1.9
- **Description**: Class discovery and detail with booking CTA matching member-classes.tsx. Shipped with #120.

### T6.3: Member trainer page per design (member-trainer.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.9
- **Description**: Trainer browse/detail in the member portal matching the formacore artboard. Shipped with #120.

### T6.4: Member bookings per design (member-bookings.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.9
- **Description**: Upcoming/past bookings with cancel action matching the formacore artboard. Shipped with #120.

### T6.5: Member shop per design (member-shop.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.9
- **Description**: Product browsing in the member portal matching the formacore artboard. Shipped with #120.

### T6.6: Member cart + checkout per design (member-cart.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T6.5
- **Description**: Cart and checkout flow (stub payment) matching the formacore artboard. Shipped with #120.

### T6.7: Member profile per design (member-profile.tsx)

- [x] **Status**: DONE
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.9
- **Description**: Profile + goals (MemberGoal) matching the formacore artboard, backed by /me. Shipped with #120.

### T6.8: Member portal design-parity audit

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Description**: Screen-by-screen comparison of the shipped portal against the 8 formacore Member App artboards (light + dark); file and fix the diffs.

### T6.9: Member portal responsive + i18n polish

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 4h
- **Depends on**: T6.8
- **Description**: Mobile-web breakpoints and full ka/en coverage across the redesigned portal.

### T6.10: Member notification surface (bell + inbox)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T8.4
- **Description**: In-portal notification bell with unread badge and inbox list, fed by the notification service (Phase 8).


---


## Phase 7: Mobile App per Design

**Goal**: Rebuild the Expo member app screens to the formacore Mobile artboards.

**Progress**: 0 / 10 done

### T7.1: Mobile sign-in per design (member-signin-mobile.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.10
- **Description**: Auth screens restyled to the formacore mobile sign-in artboard (credentials + OAuth buttons).

### T7.2: Mobile home per design (member-home-mobile.tsx)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.10
- **Description**: Home tab matching the formacore mobile home artboard: next class, quick actions, highlights.

### T7.3: Mobile classes list per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.10
- **Description**: Classes tab (day strip + list) matching member-classes-mobile.tsx.

### T7.4: Mobile class detail per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T7.3
- **Description**: Class detail with occupancy and Book/Waitlist actions matching member-classdetail-mobile.tsx.

### T7.5: Mobile trainer screen per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.10
- **Description**: Trainer browse/detail matching member-trainer-mobile.tsx.

### T7.6: Mobile shop per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.10
- **Description**: Shop tab + product page matching member-shop-mobile.tsx.

### T7.7: Mobile cart + checkout per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T7.6
- **Description**: Cart and checkout flow matching member-cart-mobile.tsx (stub payment until a real provider lands).

### T7.8: Mobile QR check-in per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.10
- **Description**: QR display screen matching member-checkin-mobile.tsx, wired to the check-in backend (T2.8).

### T7.9: Mobile profile per design

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T1.10
- **Description**: Profile tab (account, membership summary, settings, notifications) matching member-profile-mobile.tsx.

### T7.10: Mobile parity audit + EAS preview build

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T7.1
- **Description**: Compare rebuilt screens against the 9 mobile artboards, fix diffs, cut an EAS preview build for device testing.


---


## Phase 8: Notifications & Live Updates

**Goal**: A real notification pipeline (model, channels, jobs) and live-feeling admin surfaces. Today only push-token registration exists.

**Progress**: 0 / 10 done

### T8.1: Notification model + dispatch service

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 8h
- **Description**: Notification table + NotificationService.send({userId, category, payload, channels}) resolving user preferences, with dedupe and per-channel adapters behind an interface.

### T8.2: Email templates + platform lead capture

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T8.1
- **Description**: Transactional templates (booking confirm/cancel, subscription events) in ka/en via Resend; wire the platform trial/demo lead forms that are currently frontend-only placeholders.

### T8.3: Expo push send pipeline

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T8.1
- **Description**: Push channel adapter using the existing PushToken registrations; deep links into the relevant mobile screen.

### T8.4: In-app inbox API (list, unread count, mark read)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T8.1
- **Description**: Paginated notifications endpoint powering the web bell (T6.10) and the mobile notifications screen.

### T8.5: Mobile notifications screen wired to inbox

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T8.4
- **Description**: The existing profile/notifications screen shows real inbox data with read states.

### T8.6: Booking reminder job (2h before class)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T8.1
- **Description**: Scheduled job sending class reminders via preferred channels; skips canceled/attended bookings.

### T8.7: Billing notifications (renewal, failed charge, trial ending)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Depends on**: T8.1, T5.4
- **Description**: Subscription lifecycle notifications emitted from the renewal job and dunning ladder.

### T8.8: Ops notifications (low stock, daily summary)

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T8.1
- **Description**: Owner/manager alerts: low-stock digest and end-of-day summary email.

### T8.9: Live check-in + activity stream (SSE or socket)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Description**: Upgrade the polling reception board and activity feed to server-pushed events (SSE first; Socket.IO if bidirectional needs appear).

### T8.10: Live class occupancy on schedule + member views

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T8.9
- **Description**: Occupancy updates pushed to the admin schedule and member class detail on book/cancel/promote.


---


## Phase 9: Quality — Tests, Security, Performance

**Goal**: Confidence in the new billing core and redesigned surfaces: integration tests, e2e flows, security and performance passes.

**Progress**: 0 / 10 done

### T9.1: Integration tests: subscription lifecycle

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 8h
- **Depends on**: T5.3
- **Description**: Enrollment, renewal, trial conversion, freeze interaction, dunning → EXPIRED — against real Postgres via the existing integration harness.

### T9.2: Integration tests: billing job idempotency

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T5.4
- **Description**: Running the renewal job twice for the same period never double-charges; failed-charge retries follow the ladder exactly once each.

### T9.3: E2E: admin core flows (Playwright)

- [ ] **Status**: TODO
- **Complexity**: High · **Estimate**: 10h
- **Description**: Login → member CRUD → schedule a class → check-in → POS sale → refund, against the redesigned screens.

### T9.4: E2E: member booking + checkout (Playwright)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Description**: Member registers, books a class (capacity + waitlist path), buys from the shop; runs in CI.

### T9.5: Mobile smoke tests (Maestro)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T7.10
- **Description**: Login, book class, show QR, shop checkout on the rebuilt Expo app.

### T9.6: Component tests for ui-web kits

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T1.4
- **Description**: Table, form and overlay kit behavior (sorting, validation, focus traps) so screen rebuilds stay safe.

### T9.7: Security pass on new endpoints + rate limiting

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T5.3
- **Description**: Throttling on auth + enrollment + check-in endpoints, permission review of every new controller (deny-by-default guard already enforced), input sanitization.

### T9.8: Accessibility pass on redesigned screens

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Description**: Keyboard navigation, focus states, contrast in both themes across admin + member portal.

### T9.9: Performance pass (Lighthouse + admin TTI)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Description**: Portal pages ≥90 Lighthouse performance; admin lists <300ms server response at 10k members; fix regressions from the redesign.

### T9.10: Coverage gate ≥70% maintained

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T9.1
- **Description**: Keep the CI coverage gate honest as billing/notification services land; add missing unit specs.


---


## Phase 10: Launch — Pilot Gym Go-Live

**Goal**: Ship it: production pipeline verified, monitoring on, a pilot gym onboarded and running real bookings + check-ins.

**Progress**: 0 / 10 done

### T10.1: Production deploy pipeline verification

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Description**: Migrate → Railway API → Vercel apps on main merge, pre-deploy DB snapshot, rehearsed rollback; document in ROLLBACK.md.

### T10.2: Monitoring, alerting, release tagging

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T10.1
- **Description**: Sentry releases per deploy, uptime checks, alerts for error spikes and job failures; wire the Sentry TODOs in platform/superadmin error boundaries.

### T10.3: Pilot seed + demo data

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Description**: Realistic seed for demos and pilot onboarding: plans, classes 4 weeks out, products, staff roles.

### T10.4: Docs refresh (README, API docs, ADRs)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 4h
- **Description**: README bootable in under an hour, OpenAPI at /docs, ADRs for billing job, notification pipeline and payment abstraction.

### T10.5: Operational runbook

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T10.1
- **Description**: Top-5 incident playbooks (API down, failed migration, billing job stuck, R2 outage, webhook flood).

### T10.6: Final design-parity audit (all apps)

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 5h
- **Depends on**: T6.8, T7.10
- **Description**: Full sweep of admin, member web and mobile against every formacore artboard in both themes; punch list closed.

### T10.7: Pilot gym onboarding

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 6h
- **Depends on**: T10.3
- **Description**: Onboard one real gym: owner signup, staff, plans, schedule, ≥10 active members; support them through week one.

### T10.8: Feature flags for unfinished surfaces

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Description**: Env-based flags hiding not-yet-ready features (e.g. real payments) so partial phases can ship safely.

### T10.9: Pilot feedback loop + fixes buffer

- [ ] **Status**: TODO
- **Complexity**: Medium · **Estimate**: 8h
- **Depends on**: T10.7
- **Description**: Structured feedback capture from the pilot gym and a dedicated buffer for the fixes that will surface.

### T10.10: Launch checklist + go-live

- [ ] **Status**: TODO
- **Complexity**: Low · **Estimate**: 3h
- **Depends on**: T10.9
- **Description**: Final checklist (backups, alerts firing, runbook linked, parity audit clean) and the go/no-go call.


---


## Progress Tracking

- **Total Tasks**: 108
- **Completed**: 22 / 108
- **In Progress**: 1
- **Remaining estimate**: ~442h of ~559h total

🎯 **Current focus**: Phase 1 consolidation (T1.3–T1.7 shared kits) + Phase 3 schedule screen
and Phase 5 subscription enrollment — the highest-leverage unblockers.

## Success Criteria

**Design milestone done** when every formacore artboard (admin 18, member web 8, mobile 9,
marketing 1) has a shipped counterpart passing the parity audits (T6.8, T7.10, T10.6) in both
themes.

**Billing core done** when a member can enroll in a plan (admin- or self-serve), the renewal
job advances periods idempotently, failed charges walk the dunning ladder, trials convert,
and invoices appear with PDFs in the member portal.

**Launch done** when one pilot gym runs real class bookings and QR/manual check-ins for a
week on production, with monitoring green and the runbook exercised.
