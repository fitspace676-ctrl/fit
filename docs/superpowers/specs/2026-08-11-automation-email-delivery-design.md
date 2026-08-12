# Automation, phase A: rules that actually send

## Problem

The automation builder lets staff write an email with merge fields, save the rule,
and watch it fire. Nothing is ever delivered.

`AutomationExecutorService.recordRun` writes an `AutomationRun` row whose `detail`
is a hardcoded string — `'Queued email (stubbed executor)'`
(`automation-executor.service.ts:339`) — and returns. The rule's `actionConfig`,
which holds the `subject` and `body` the staffer wrote, is never read outside the
CRUD service and its specs. No mail is sent and no `{{token}}` is ever expanded.

The run log therefore reports `SUCCESS` for every fire, which reads as "we emailed
your member" and means "we wrote a row".

The consequence for the merge-field palette: all twenty-two chips in the rule
editor are decoration. That is why this phase comes before curating them.

## Scope

**In scope:** delivering the `email` action, and expanding merge tokens at send.

**Out of scope:** `sms`, `push_notification` and `create_task`. None has a
provider or a target table. They keep recording a run, but their `detail` stops
claiming a send — see "Honest run details" below.

Also out of scope: the merge-field catalogue and its Settings screen (phase B).

## Design

### 1. Resolving the recipient and the values

A new `AutomationMergeService` (`apps/api/src/automation/automation-merge.service.ts`):

```ts
resolve(gymId: string, context: AutomationDispatchContext):
  Promise<{ recipient: string | null; values: MergeValues } | null>
```

It maps a dispatch context to the person the message is about:

| `entityType`           | Resolution                                             |
| ---------------------- | ------------------------------------------------------ |
| `'member'`             | `GymMember` by id, with its user and live subscription |
| `'subscription'`       | `Subscription` by id → its `GymMember`                 |
| anything else / absent | `null` — nothing to personalise, nothing to send       |

Both live dispatch paths are covered: `member_joined` passes a member id
(`members.service.ts:393`), the expiry scan passes a subscription id
(`automation-executor.service.ts:298`).

Queries run on the **unscoped** `PrismaService` with an explicit `gymId`, because
the executor fires from the tenant-less cron as well as inline in a request. Every
lookup is constrained by `gymId` so a stray id can never resolve across tenants.

### 2. Which tokens get values

Phase A fills the tokens the two live triggers can actually back:

- `member_first_name`, `member_last_name`, `member_email`, `member_phone`
- `member_plan_name`, `member_expiry_date`
- `business_name`

plus the bare marketing aliases (`first_name`, `email`, …) so a body written in
either editor personalises, mirroring `MembersService.memberMergeValues`.

Tokens with no value — the `class_*` and `payment_*` groups under these triggers —
are **blanked**, not left raw: `interpolateMergeFields` defaults to
`blankMissing: true`, so a `{{class_name}}` can never reach a member as literal
braces. Widening the catalogue is phase B's job, and each token added there gets a
resolver here or does not ship.

### 3. Sending

In the `email` branch, the executor mirrors the send path that already works for
one-off staff mail (`members.service.ts:707-725`): interpolate `subject` and
`body`, wrap the body with `renderBrandedEmail`, send through `MailerService`.
`MailModule` is `@Global` and exports the mailer, so no module wiring changes.

`MailerService.send` resolves `{ sent: false }` rather than throwing when Resend is
unconfigured. That is a skip, not a failure: a developer machine with no
`RESEND_API_KEY` should log honestly, not fill the run table with `FAILED`.

### 4. Honest run details

`detail` stops being a fixed string:

| Situation                                   | Status    | Detail                                              |
| ------------------------------------------- | --------- | --------------------------------------------------- |
| Email delivered                             | `SUCCESS` | `Emailed <address>`                                 |
| Resend unconfigured                         | `SUCCESS` | `Email not sent — mail transport is not configured` |
| No recipient resolved                       | `SUCCESS` | `No recipient for this trigger — nothing sent`      |
| Send threw                                  | `FAILED`  | `Email failed: <reason>`                            |
| `sms` / `push_notification` / `create_task` | `SUCCESS` | `<Action> is not delivered yet — logged only`       |

The run row is still written in every case, so the log stays a complete history of
what fired. What changes is that it no longer says "queued" about something no
queue exists for.

### 5. Failure containment

The executor's existing contract is unchanged and load-bearing: `member_joined` is
dispatched fire-and-forget from member creation, so **the executor must never
throw**. Sending is wrapped so a mail failure becomes a `FAILED` run, never an
exception escaping `dispatchForGym`. The dedupe guard, the Redis scan lock and the
cron are untouched.

## Testing

`automation-executor.service.spec.ts`:

- an `email` rule with a member context interpolates the body and calls the mailer
  with the member's address
- the recorded `detail` names the recipient, and a `SUCCESS` row is written
- an unconfigured mailer records the "not configured" detail and does not fail
- a throwing mailer records `FAILED` and `dispatchForGym` still resolves
- a context with no resolvable entity sends nothing and says so
- `sms` records the not-delivered detail and never touches the mailer

`automation-merge.service.spec.ts`:

- a member context yields the member's tokens and their bare aliases
- a subscription context resolves through to its member
- a foreign `gymId` resolves to `null` (tenant containment)
- a member with no live subscription yields empty plan/expiry rather than throwing
