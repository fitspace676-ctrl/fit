import { Injectable } from '@nestjs/common';
import type { NotificationCategory } from '@fit/db';
import { PrismaService } from '../prisma/prisma.service';

/** A notification to deliver to one member's in-app inbox. The recipient is
 * addressed explicitly by `(gymId, userId)` — never read from ambient tenant
 * scope — so a caller outside a request (a scheduled reminder/billing job,
 * T8.6/T8.7) can dispatch just as a request-scoped producer can. */
export interface DispatchNotificationInput {
  /** The gym the notification belongs to (the recipient's tenant). */
  gymId: string;
  /** The recipient user id. */
  userId: string;
  /** Category — drives the icon/grouping the portal renders. */
  category: NotificationCategory;
  /** Short headline. */
  title: string;
  /** One- or two-line body. */
  body: string;
  /** Optional in-app deep-link the portal routes to when tapped (e.g. `/bookings`). */
  href?: string | null;
  /** Optional idempotency key. Persisted on the row so the `(userId, dedupeKey)`
   * unique index rejects a duplicate delivery of the same logical notification
   * (T8.1 dedupe). Null/omitted for one-off notices that need no dedupe. */
  dedupeKey?: string | null;
}

/**
 * Notification dispatch — the write half of the notification pipeline (Phase 8,
 * T8.1 core). {@link dispatch} persists one in-app inbox row for a member; the
 * member reads it back through {@link NotificationInboxService} and the portal
 * bell (T6.10).
 *
 * This is the reusable seam every producer calls. Runs on the **unscoped**
 * {@link PrismaService} and stamps `gymId` + `userId` explicitly from the input
 * (a `Notification` is deliberately outside the tenant extension's auto-scope
 * set), so it does not depend on an ambient request tenant — the class-booking
 * flow can call it in-request today, and the reminder/billing jobs (T8.6/T8.7)
 * can call it from a scheduler tomorrow, both by naming the recipient.
 *
 * Only the in-app channel exists here; the email (T8.2) and Expo push (T8.3)
 * channels are separate Phase-8 tasks that will hang off this same seam.
 */
@Injectable()
export class NotificationDispatchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a single in-app notification for `(gymId, userId)` and return its id.
   * A plain create — inbox items are append-only until the member marks them
   * read — with `href` and `dedupeKey` normalised to `null` when omitted. When a
   * `dedupeKey` is supplied the `(userId, dedupeKey)` unique index makes a repeat
   * create throw `P2002`; the caller ({@link NotificationService}) treats that as
   * a dedupe hit rather than an error.
   */
  async dispatch(input: DispatchNotificationInput): Promise<{ id: string }> {
    const row = await this.prisma.client.notification.create({
      data: {
        gymId: input.gymId,
        userId: input.userId,
        category: input.category,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
      select: { id: true },
    });
    return { id: row.id };
  }
}
