# Pilot gym onboarding (T10.7)

The operator playbook for taking **one real gym live** and supporting it through
its first week: owner signup, staff, plans, a class schedule, ≥10 active members,
and the day-by-day support loop that turns a fresh tenant into a running gym.

It leans on one command — [`fit gym onboard`](../tools/cli) — that stands up the
whole tenant in a single idempotent call, plus the deploy/monitoring docs it sits
alongside:

- [`ROLLBACK.md`](../ROLLBACK.md) — the release pipeline and how to undo a deploy.
- [`monitoring.md`](./monitoring.md) — Sentry, uptime probes, and the alert rules.
- [`runbook.md`](./runbook.md) — the incident playbooks if something pages you.

> **The go-live bar (T10.10):** the gym is _onboarded_ when it has an owner, staff,
> plans, a forward class schedule, and **≥10 active members with a live
> subscription**, and it runs real bookings + check-ins for a week with monitoring
> green. `fit gym onboard` reports `meetsPilotFloor` so you can see the member bar
> at a glance.

---

## The one command

```bash
pnpm fit gym onboard \
  --name "Iron House" \
  --slug iron-house \
  --owner-email owner@ironhouse.ge \
  --roster ./iron-house-members.json
```

It provisions, **idempotently** (every write is an upsert / existence-guard, so
re-running only reconciles — it never duplicates or re-prices):

| Provisioned      | Detail                                                                         |
| ---------------- | ------------------------------------------------------------------------------ |
| **Owner wiring** | The gym's `ownerId` + an ACTIVE `OWNER` membership for `--owner-email`.        |
| **Staff**        | ACTIVE `MANAGER` / `RECEPTIONIST` / `TRAINER` memberships (rename in-console). |
| **Plans**        | Premium / Standard / Student subscription plans (GEL).                         |
| **Schedule**     | Three recurring weekly class templates, materialised 4 weeks ahead.            |
| **Members**      | Every roster row as an ACTIVE member with one ACTIVE subscription.             |

It prints a JSON summary (member/subscription/class counts + `meetsPilotFloor`).
It **refuses** to run when the owner account does not exist (`OWNER_NOT_FOUND`)
or when the slug is already owned by someone else (`OWNER_MISMATCH`), so it can
never fabricate an owner or hijack a tenant.

**Flags:** `--roster <file>` imports the gym's real member list;
`--members <n>` (default 10) generates a placeholder roster instead; `--dry-run`
prints exactly what a real run would provision without writing anything.

### Roster file

A JSON array — `plan` is optional (defaults round-robin across the plan set):

```json
[
  { "name": "Nino Kapanadze", "email": "nino@example.ge", "plan": "Premium" },
  { "name": "Giorgi Beridze", "email": "giorgi@example.ge" }
]
```

Members and staff are created as **verified accounts without a password** — they
set one through the normal "forgot password" flow on first sign-in, so no
credential is ever fabricated for a real person.

---

## Pre-flight checklist

Before you onboard a real gym, confirm the platform underneath it is live:

- [ ] Production is deployed and green — `pnpm fit services health --pretty`
      reports `healthy: true` for Postgres, Redis, the API, and R2.
- [ ] Monitoring is on — Sentry is receiving events and the uptime + job-failure
      alerts described in [`monitoring.md`](./monitoring.md) are armed.
- [ ] Online payments are **off** — `NEXT_PUBLIC_PAYMENTS_ENABLED` is unset/false
      (T10.8), so checkout honestly reserves a membership for front-desk payment
      rather than implying an online charge (there is no real gateway yet).
- [ ] A rollback target exists — a pre-deploy snapshot was taken
      ([`ROLLBACK.md`](../ROLLBACK.md)).

---

## Week-one plan

### Day 0 — provision

1. **Owner signs up.** The owner registers through the normal flow at the gym's
   subdomain and picks their own password. (`fit gym onboard` requires the owner
   account to already exist — this is that step.)
2. **Collect the roster.** Export the gym's existing member list to the roster
   JSON above (≥10 for the pilot bar).
3. **Preview**, then run:
   ```bash
   pnpm fit gym onboard --name "…" --slug … --owner-email … --roster … --dry-run
   pnpm fit gym onboard --name "…" --slug … --owner-email … --roster …
   ```
4. **Verify** the summary shows `meetsPilotFloor: true` and the expected
   member/subscription/class counts.

### Day 1 — walk the owner through the console

- Sign in as the owner; confirm the dashboard, members list, schedule, and plans
  all render the seeded data.
- Rename the placeholder staff to the real people (or re-invite them) from the
  **Staff** screen; adjust the class **Schedule** and **Plans** to the gym's real
  offering. Everything the command seeded is meant to be edited, not kept as-is.
- Do a live **check-in** at the reception board and a test **class booking** so
  the owner has seen the core loop end to end.

### Days 2–6 — support the loop

- **Each morning:** `pnpm fit services health` + a glance at the Sentry error
  feed and the [monitoring](./monitoring.md) dashboards. Any error spike or
  job-failure alert → the [on-call runbook](./runbook.md).
- **Watch the real signal:** members booking classes and checking in. The
  dashboard KPIs and activity feed should climb through the week — that is the
  launch success criterion (real bookings + check-ins for a week).
- **Capture everything** the gym reports — see below.

### Day 7 — go / no-go

Roll the week's feedback and fixes into the [pilot feedback loop (T10.9)](#feedback-capture)
and the [launch checklist (T10.10)](./runbook.md), then make the go/no-go call.

---

## Feedback capture

Keep a single running log for the pilot week so nothing is lost between the gym's
report and a fix. For each item record: **date · who · surface (admin/web/mobile)
· what happened · severity · disposition**. Severity drives the response:

- **Blocker** (can't run the gym) — fix now; if it needs a deploy, follow the
  release pipeline and note the rollback target.
- **Friction** (works, but painful) — batch into the T10.9 fixes buffer.
- **Wishlist** — record for the next milestone; do not scope-creep the pilot.

This log is the raw input to **T10.9 (pilot feedback loop + fixes buffer)** and
the evidence for the **T10.10** go/no-go.

---

## Troubleshooting

| Symptom                         | Cause / fix                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `OWNER_NOT_FOUND`               | The owner hasn't signed up yet — register them through the normal flow first.           |
| `OWNER_MISMATCH`                | The slug is already owned by another account — pick a new slug or reconcile.            |
| `Invalid --slug`                | Slugs are DNS labels: lowercase letters, digits, interior hyphens only.                 |
| `BAD_ROSTER`                    | The roster isn't a JSON array of `{ name, email, plan? }`, or a row lacks a name/email. |
| `meetsPilotFloor: false`        | Fewer than 10 active members — import the rest of the roster and re-run.                |
| Re-run shows `subscriptions: 0` | Expected — members already have a live subscription; the run is a no-op reconcile.      |
