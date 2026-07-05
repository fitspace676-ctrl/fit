# Member notification pipeline

Every producer that needs to reach a member — a class booking, the billing sweep, a
booking reminder, an ops alert — calls **one seam**. That seam resolves the member's
per-channel preferences, dedupes, and fans the message out across the registered
delivery channels. Adding a channel is implementing an interface and registering an
adapter; no producer changes.

| Aspect        | Choice                                                          |
| ------------- | --------------------------------------------------------------- |
| Producer seam | `NotificationService.send({ gymId, userId, category, … })`      |
| Channels      | `NotificationChannelAdapter` registry (in-app, email, push)     |
| Addressing    | explicit `(gymId, userId)` — never ambient request tenant scope |
| Dedupe        | optional `dedupeKey` + a `(userId, dedupeKey)` unique index     |
| Preferences   | per-member, per-channel opt-outs subtracted before delivery     |

## The seam

`NotificationService` (`apps/api/src/notifications/notification.service.ts`) is the
single entry point every producer calls. `send` takes a notification addressed to one
member and:

1. **Dedupe** — with a `dedupeKey`, a prior notification carrying it for this user
   short-circuits the whole send (nothing delivered). The DB's `(userId, dedupeKey)`
   unique index is the race backstop: a concurrent duplicate throws `P2002`, which
   the orchestrator maps to a dedupe hit rather than an error.
2. **Preferences** — the member's per-channel opt-outs for the notification's
   `category` are subtracted from the requested channel set. A muted channel is
   reported as `suppressed`, not delivered.
3. **Fan-out** — the message is handed to each surviving channel's adapter. The
   result names, per channel, what was delivered (or left `pending` when the channel
   had no way to deliver in this environment).

Crucially, a notification is **addressed explicitly** by `(gymId, userId)` and the
service runs on the **unscoped** `PrismaService`, keying every read/write on that
pair. A `Notification` / `NotificationPreference` sits deliberately _outside_ the
tenant extension's auto-scope set, so an in-request producer (a class booking) and an
out-of-request job (the billing sweep, a booking reminder) call `send` **the same
way** — by naming the recipient. This is what lets the scheduled jobs notify at all.

## Channels

Each channel implements `NotificationChannelAdapter` (`notification-channels.ts`):

```ts
interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  deliver(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult>;
}
```

The adapters are assembled into the `NOTIFICATION_CHANNEL_REGISTRY` that the
orchestrator fans out through. Three are live:

- **In-app** — the one default-on channel. Persists an inbox `Notification` row via
  `NotificationDispatchService` (the low-level writer), which the portal bell / inbox
  reads back. Its `ref` is the created row id.
- **Email** — renders a localised notification email and sends it through
  `MailerService`. Degrades to `pending` (a no-op, not a failure) when email is
  unconfigured or the member has no address.
- **Push** — delivers an Expo push over `ExpoPushService`. Degrades to `pending`
  when push is disabled or the member has no registered device.

`send` defaults to **in-app only** (`DEFAULT_CHANNELS`); email and push are opt-in per
producer, requested explicitly in the `channels` argument. A channel that cannot
deliver in the current environment returns `pending` rather than throwing, so callers
and tests can tell a real delivery from a no-op without the channel pretending it
delivered. A genuine channel failure _does_ propagate — it is not silently swallowed.

## Why a seam, not direct writes

Producers span the request boundary. Class bookings notify in-request; the billing
sweep (`billing-notifications.service.ts`), booking reminders, and ops alerts notify
from a scheduler with no ambient tenant. If each wrote its own inbox row (or called
its own mailer) we would have N copies of preference resolution, dedupe, and
channel-fan-out logic, drifting apart. One seam means:

- **Preferences and dedupe are enforced once**, for every producer, in one place.
- **A new channel lands in one file** — implement the adapter, register it — and every
  producer can immediately target it.
- **The scheduled jobs are first-class.** Because addressing is explicit, the billing
  and reminder jobs are not a special case; they are ordinary callers.

## Dedupe in practice

The `dedupeKey` is what makes an at-most-once producer safe to re-run. The billing
sweep's trial-ending warning, for example, keys on the subscription so a member is
warned once even though the daily sweep re-evaluates the same trial every day inside
the lead window. The unique index is the backstop; the pre-read is the fast path.

## Related

- `docs/adr/subscription-billing-job.md` — the largest out-of-request producer.
- `NotificationInboxController` — the member-facing read side (`GET /notifications`,
  `/unread-count`, `/mark-read`) behind the `NotificationManage` permission.
