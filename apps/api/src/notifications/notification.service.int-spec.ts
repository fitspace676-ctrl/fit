import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymStatus, NotificationCategory, NotificationChannel, Role } from '@fit/db';
import {
  EmailNotificationChannel,
  InAppNotificationChannel,
  PushNotificationChannel,
  buildChannelRegistry,
} from './notification-channels';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationService } from './notification.service';
import { disconnect, prisma, resetDb } from '../test/integration-db';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailerService } from '../mail/mailer.service';

/**
 * The dispatch orchestrator (T8.1) proven against a real Postgres: an in-app
 * send persists a readable inbox row; a member's per-channel opt-out mutes the
 * channel; and a `dedupeKey` makes a repeated send idempotent — the second call
 * writes no second row and reports `deduped`, backed by the `(userId, dedupeKey)`
 * unique index.
 */
const prismaService = { client: prisma } as unknown as PrismaService;
// An unconfigured mailer: the email channel routes as a `pending` placeholder, so
// these in-app persistence tests don't attempt a live send (the email channel's
// own transport is covered by notification-channels.spec.ts).
const mailer = { isConfigured: false } as unknown as MailerService;
const registry = buildChannelRegistry([
  new InAppNotificationChannel(new NotificationDispatchService(prismaService)),
  new EmailNotificationChannel(prismaService, mailer),
  new PushNotificationChannel(),
]);
const service = new NotificationService(prismaService, registry);

describe('NotificationService (integration)', () => {
  let gymId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    const gym = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;
    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;
    await prisma.gymMember.create({ data: { userId, gymId, role: Role.MEMBER } });
  });

  afterAll(disconnect);

  it('delivers an in-app notification that persists to the recipient inbox', async () => {
    const result = await service.send({
      gymId,
      userId,
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'Morning HIIT · Mon 08:00',
      href: '/bookings',
    });

    expect(result.deduped).toBe(false);
    expect(result.delivered).toHaveLength(1);
    const rows = await prisma.notification.findMany({ where: { gymId, userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: 'Booking confirmed', href: '/bookings', readAt: null });
  });

  it('suppresses a channel the member has muted for the category', async () => {
    await prisma.notificationPreference.create({
      data: {
        gymId,
        userId,
        category: NotificationCategory.BOOKING,
        channel: NotificationChannel.IN_APP,
        enabled: false,
      },
    });

    const result = await service.send({
      gymId,
      userId,
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'x',
    });

    expect(result.suppressed).toEqual([NotificationChannel.IN_APP]);
    expect(result.delivered).toHaveLength(0);
    const rows = await prisma.notification.count({ where: { gymId, userId } });
    expect(rows).toBe(0);
  });

  it('does not mute a different category or a different channel', async () => {
    // Mute BILLING email only — BOOKING in-app must be unaffected.
    await prisma.notificationPreference.create({
      data: {
        gymId,
        userId,
        category: NotificationCategory.BILLING,
        channel: NotificationChannel.EMAIL,
        enabled: false,
      },
    });

    const result = await service.send({
      gymId,
      userId,
      category: NotificationCategory.BOOKING,
      title: 'Booking confirmed',
      body: 'x',
    });

    expect(result.suppressed).toEqual([]);
    expect(result.delivered).toHaveLength(1);
  });

  it('is idempotent for a repeated dedupeKey — one row, second call deduped', async () => {
    const send = () =>
      service.send({
        gymId,
        userId,
        category: NotificationCategory.BOOKING,
        title: 'Class in 2h',
        body: 'Morning HIIT',
        dedupeKey: 'reminder:booking-9',
      });

    const first = await send();
    const second = await send();

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    const rows = await prisma.notification.count({ where: { gymId, userId } });
    expect(rows).toBe(1);
  });

  it('scopes dedupe per user — the same key for two members both deliver', async () => {
    const other = await prisma.user.create({ data: { email: 'other@example.com' } });
    await prisma.gymMember.create({ data: { userId: other.id, gymId, role: Role.MEMBER } });

    const base = {
      gymId,
      category: NotificationCategory.SYSTEM,
      title: 'Notice',
      body: 'x',
      dedupeKey: 'broadcast-1',
    };
    const a = await service.send({ ...base, userId });
    const b = await service.send({ ...base, userId: other.id });

    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(false);
    const rows = await prisma.notification.count({ where: { gymId } });
    expect(rows).toBe(2);
  });
});
