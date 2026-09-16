# Atomic counters

A mutable counter or balance is **claimed**, never read-then-written. The database
does the arithmetic and evaluates the bound; the application decides what to do when
the claim does not land.

| Aspect     | Choice                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| Registry   | `/// @counter` on the column in `schema.prisma`                         |
| Safe write | `{ increment }` / `{ decrement }`, bounded by a `WHERE` on `updateMany` |
| Lost race  | `count === 0` — a normal outcome the caller handles, not an error       |
| Build gate | `pnpm check:atomic-counters` (`scripts/check-atomic-counters.ts`)       |
| Proof      | a concurrency `*.int-spec.ts` per invariant, against real Postgres      |

## The problem

Postgres runs on READ COMMITTED. Inside a transaction, this:

```ts
const pack = await tx.creditPack.findFirst({ where: { id } });
await tx.creditPack.update({ where: { id }, data: { remaining: pack.remaining - 1 } });
```

is three statements with a gap. Two requests both read `5`, both write `4`, and one
draw is gone — while both callers were told they succeeded. Nothing throws, no
constraint is violated, and the row is internally consistent. The damage shows up
later, as a ledger that disagrees with the column it is supposed to explain.

The transaction does not help: READ COMMITTED takes no lock on a row it merely read,
and the second write simply overwrites the first. Only the _write_ is atomic, so the
decision has to live inside it.

## The shape

```ts
const claimed = await tx.creditPack.updateMany({
  where: { id, status: 'ACTIVE', remainingCredits: { gt: 0 } },
  data: { remainingCredits: { decrement: 1 } },
});
if (claimed.count === 0) {
  // Someone took the last credit between our read and our write.
}
```

Two things happen here that cannot happen in the read-then-write version. The
arithmetic is resolved by the database against the live row, so no figure this
process read can go stale. And the bound (`> 0`) is part of the same statement, so
the row is only touched while the invariant holds — the predicate and the update
cannot be separated by another writer.

`count === 0` is then the interesting outcome, and it is _not_ an error. It means the
race was lost, and the caller decides: reject (`bookings` returns `409`), fall through
to the next candidate (`credit-packs` retries against another pack), or give up
quietly. Code that ignores the count has not actually claimed anything.

Two writes are exempt, because neither depends on a prior read:

- a `create` — the row does not exist yet, so nothing races it;
- a literal reset — `bookedCount: 0`, `waitlistPosition: null`. A constant is the same
  constant however many writers store it.

## The registry

A counter is declared where it lives, on the column:

```prisma
model CreditPack {
  /// @counter
  remainingCredits Int
}
```

Keeping the marker in `schema.prisma` rather than in a list beside the checker is the
point: adding a counter and forgetting to register it is not two separate steps that
can drift apart. The checker enforces that in both directions —

1. a `/// @counter` field may only be written via `{ increment }` / `{ decrement }`;
2. any field written with `{ increment }` / `{ decrement }` **must** carry the marker.

Rule 2 is what keeps the registry from rotting. Writing a field atomically is an
admission that it is a counter; without the marker, its other write sites would go
unchecked.

## What the checker cannot see

The check binds a write to a model through the Prisma accessor it is called on
(`tx.payment.update(...)`), and expands conditional patch spreads. Three things stay
out of reach, and they are named here so nobody mistakes a green build for a proof:

- **a counter inside a JSON column.** `Product.variants[].stock` is per-variant stock
  living in a JSON blob. Neither Postgres nor the checker can see a column that is not
  one; the whole array is read, edited in memory, and written back. That is a lost
  update by construction, and the only real fix is a column — or a table.
- **nested relation writes.** `data: { payment: { update: { … } } }` does not name a
  model the rule can resolve.
- **an opaque spread** — `data: { ...patch }` where `patch` is built elsewhere.

## The proof

The checker enforces the _shape_ of a write. It cannot enforce the _invariant_: an
unbounded `{ increment }` is atomic and still lets a payment be refunded past its own
total. That is what the concurrency specs are for — one per invariant, firing
concurrent operations at a real Postgres and asserting the property afterwards:

```ts
const results = await Promise.allSettled([refund(id, 50), refund(id, 50), refund(id, 50)]);
const payment = await prisma.payment.findUniqueOrThrow({ where: { id } });
const rows = await prisma.refund.aggregate({ _sum: { amount: true }, where: { paymentId: id } });
expect(payment.refundedAmount).toBe(rows._sum.amount);
expect(payment.refundedAmount).toBeLessThanOrEqual(payment.amount);
```

These run in the `integration` CI job, which already provisions Postgres for the
tenant-isolation suites. A guard nobody has watched fail is a guess; assert the
property, watch the test fail against the old code, then fix it.

## Waiving the rule

```ts
// atomic-counter-exempt: cron-only, serialised by the Redis single-runner lock
paymentRetries: sub.paymentRetries + 1,
```

Written on the property (above it, or trailing it), so the reasoning sits with the
code and `git blame` names whoever accepted it. A waiver is for a counter that
genuinely has one writer — not for one that is merely unlikely to collide.
