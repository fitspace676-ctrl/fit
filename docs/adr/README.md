# Architecture decision records

Short records of the **why** behind decisions that are cheap to make wrong and
expensive to reverse — the seams a new engineer needs to understand before touching
billing, notifications, or payments. Each records the decision, the forces behind it,
and how to extend it, so the reasoning outlives the commit that made it.

| ADR                                                          | Decision                                                                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [subscription-billing-job.md](./subscription-billing-job.md) | The scheduled sweep that renews memberships, runs dunning, and expires the dead                    |
| [notification-pipeline.md](./notification-pipeline.md)       | The one seam every producer calls to reach a member across in-app / email / push                   |
| [payment-provider.md](./payment-provider.md)                 | The single charge/webhook abstraction a real gateway (Stripe / TBC / BOG) plugs into               |
| [stylex-build-integration.md](./stylex-build-integration.md) | How app-authored StyleX (`xstyle`) is compiled in the Next apps, and why it coexists with Tailwind |

## Adding an ADR

Write a new topic-named Markdown file here (no numbering — file names are the index),
lead with the decision in a sentence and a summary table, then the forces and the
extension path. Add a row above. Keep it to the decisions that shape the codebase;
routine choices do not need one.
