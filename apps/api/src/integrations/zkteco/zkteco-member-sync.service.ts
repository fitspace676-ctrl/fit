import { Injectable, Logger } from '@nestjs/common';
import { GymMemberStatus, Prisma, Role, SubscriptionStatus } from '@fit/db';
import type { ZktecoSettings } from '@fit/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEVICE_BATCH_SIZE,
  ZktecoGateway,
  ZktecoUnavailableError,
  type MemberAction,
  type MemberPush,
  type ZktecoTarget,
} from './zkteco-gateway';
import { ZktecoPhotoLoader } from './zkteco-photo-loader';

/** PINs are five digits, so they sort as numbers and fit a device's 16-bit slot. */
export const FIRST_PIN = 20001;
export const LAST_PIN = 65535;
/** Re-read this much of the change feed each scan; marking a member twice is harmless. */
const CHANGE_OVERLAP_MS = 2 * 60_000;
/** First scan after enabling looks back this far. */
const FIRST_SCAN_LOOKBACK_MS = 24 * 60 * 60_000;
/** Identities pushed per job run; the rest wait for the next run. */
const PUSH_LIMIT = 200;
const LIVE = new Set<SubscriptionStatus>([
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
]);

export interface DesiredState {
  action: MemberAction | 'none';
  validFrom: Date | null;
  validUntil: Date | null;
}

interface MemberFacts {
  status: GymMemberStatus;
  deletedAt: Date | null;
  subscriptions: {
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }[];
}

export interface PushSummary {
  synced: number;
  failed: number;
  /** Set when the connection itself failed; everything stays pending. */
  error?: string;
}

const MEMBER_SELECT = {
  id: true,
  status: true,
  deletedAt: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  accessCardNumber: true,
  user: { select: { name: true } },
  subscriptions: {
    select: { status: true, currentPeriodStart: true, currentPeriodEnd: true },
    orderBy: { currentPeriodEnd: 'desc' },
    take: 5,
  },
} satisfies Prisma.GymMemberSelect;
type MemberRow = Prisma.GymMemberGetPayload<{ select: typeof MEMBER_SELECT }>;

/**
 * What a member's turnstile record should be, from their gym membership and
 * subscriptions alone. Mirrors the reception eligibility rules: a live
 * (trial/active/past-due) period that has not ended opens the gate; a frozen
 * one does so only when `blockOnFreeze` is off; anything else is the end
 * action. The end action of a standalone device is always deletion.
 */
export function desiredState(
  member: MemberFacts | null,
  options: ZktecoSettings,
  type: ZktecoTarget['type'],
  now: Date,
): DesiredState {
  const end: MemberAction = type === 'device' ? 'delete' : options.onExpiry;
  const ended: DesiredState = { action: end, validFrom: null, validUntil: null };
  if (!member) return { action: 'delete', validFrom: null, validUntil: null };
  if (member.deletedAt || member.status !== GymMemberStatus.ACTIVE) return ended;
  const live = member.subscriptions
    .filter((s) => LIVE.has(s.status) && s.currentPeriodEnd > now)
    .sort((a, b) => b.currentPeriodEnd.getTime() - a.currentPeriodEnd.getTime())[0];
  if (live) {
    return {
      action: 'activate',
      validFrom: live.currentPeriodStart,
      validUntil: live.currentPeriodEnd,
    };
  }
  const frozen = member.subscriptions.find((s) => s.status === SubscriptionStatus.FROZEN);
  if (frozen) {
    if (!options.blockOnFreeze) {
      // The period end is moved by the unfreeze; until then the gate stays open.
      return { action: 'activate', validFrom: frozen.currentPeriodStart, validUntil: null };
    }
    // Freezing is temporary: keep the person (and their fingerprints) where the
    // connection allows it, even when the end action is deletion.
    if (type === 'device') return ended;
    return {
      action: options.onExpiry === 'delete' ? 'disable' : options.onExpiry,
      validFrom: null,
      validUntil: null,
    };
  }
  return ended;
}

/**
 * Keeps each member's turnstile record in line with their membership.
 *
 * Membership changes are not hooked into the billing, freeze and enrolment
 * flows. They are read from the change feed instead: every subscription write
 * bumps `Subscription.updatedAt`, so {@link scanChanges} finds every member whose
 * standing may have moved, whichever of the many write paths moved it, and a
 * turnstile that is down can never fail or slow a sale. A period that simply
 * runs out (no write) is caught by its `currentPeriodEnd` falling inside the
 * scan window, and the nightly reconcile catches anything else.
 */
@Injectable()
export class ZktecoMemberSync {
  private readonly logger = new Logger(ZktecoMemberSync.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ZktecoGateway,
    private readonly photos: ZktecoPhotoLoader,
  ) {}

  /** Mark members whose standing may have changed since the last scan. Returns how many. */
  async scanChanges(gymId: string, target: ZktecoTarget, now: Date): Promise<number> {
    const db = this.prisma.client;
    const state = await db.zktecoSyncState.findUnique({
      where: { gymId },
      select: { lastChangeScanAt: true },
    });
    const since = new Date(
      (state?.lastChangeScanAt?.getTime() ?? now.getTime() - FIRST_SCAN_LOOKBACK_MS) -
        CHANGE_OVERLAP_MS,
    );
    const [subs, trashed] = await Promise.all([
      db.subscription.findMany({
        where: {
          gymId,
          OR: [{ updatedAt: { gt: since } }, { currentPeriodEnd: { gt: since, lte: now } }],
        },
        select: { memberId: true },
        distinct: ['memberId'],
      }),
      db.gymMember.findMany({
        where: { gymId, deletedAt: { gt: since } },
        select: { id: true },
      }),
    ]);
    const memberIds = [...new Set([...subs.map((s) => s.memberId), ...trashed.map((m) => m.id)])];
    const marked = await this.markMembers(gymId, memberIds, target, now);
    await db.zktecoSyncState.upsert({
      where: { gymId },
      create: { gymId, lastChangeScanAt: now },
      update: { lastChangeScanAt: now },
    });
    return marked;
  }

  /** Mark every member of the gym for a push: the manual "sync now" and the nightly run. */
  async markAll(gymId: string, target: ZktecoTarget, now: Date): Promise<number> {
    const members = await this.prisma.client.gymMember.findMany({
      where: { gymId, role: Role.MEMBER },
      select: { id: true },
    });
    const marked = await this.markMembers(
      gymId,
      members.map((m) => m.id),
      target,
      now,
    );
    // Identities whose member row was purged: the push deletes them from the turnstile.
    await this.prisma.client.zktecoMember.updateMany({
      where: { gymId, gymMemberId: null },
      data: { dirty: true },
    });
    return marked;
  }

  /**
   * Compare with what the server/device actually holds: an identity told
   * `active` but missing there is pushed again, one told `delete` but still
   * present is deleted again. People the gym did not create are never touched.
   */
  async reconcileRemote(gymId: string, target: ZktecoTarget, now: Date): Promise<number> {
    const remote = await this.gateway.listRemotePins(target, now);
    if (!remote) return 0;
    const identities = await this.prisma.client.zktecoMember.findMany({
      where: { gymId, dirty: false },
      select: { id: true, pin: true, state: true },
    });
    const drift = identities.filter(
      (i) =>
        (i.state === 'active' && !remote.has(i.pin)) || (i.state === 'delete' && remote.has(i.pin)),
    );
    if (drift.length) {
      await this.prisma.client.zktecoMember.updateMany({
        where: { gymId, id: { in: drift.map((i) => i.id) } },
        data: { dirty: true },
      });
    }
    return drift.length;
  }

  /**
   * Push up to {@link PUSH_LIMIT} marked identities. A connection failure leaves
   * them all marked for the next run and is reported, never thrown, so the
   * caller's other work (and other gyms) carry on.
   */
  async pushDirty(gymId: string, target: ZktecoTarget, now: Date): Promise<PushSummary> {
    const summary: PushSummary = { synced: 0, failed: 0 };
    if (!target.options.syncMembers) return summary;
    const db = this.prisma.client;
    const identities = await db.zktecoMember.findMany({
      where: { gymId, dirty: true },
      orderBy: { updatedAt: 'asc' },
      take: PUSH_LIMIT,
    });
    if (identities.length === 0) return summary;
    const memberIds = identities.map((i) => i.gymMemberId).filter((id): id is string => !!id);
    const members = new Map(
      (
        await db.gymMember.findMany({
          where: { gymId, id: { in: memberIds } },
          select: MEMBER_SELECT,
        })
      ).map((m) => [m.id, m]),
    );

    const pushes: { identity: (typeof identities)[number]; push: MemberPush }[] = [];
    for (const identity of identities) {
      const member = identity.gymMemberId ? (members.get(identity.gymMemberId) ?? null) : null;
      const desired = desiredState(member, target.options, target.type, now);
      const unchangedEnd =
        desired.action !== 'activate' &&
        (desired.action === 'none' ||
          identity.state === desired.action ||
          identity.state === 'none');
      if (unchangedEnd) {
        // Nothing to tell the turnstile: never pushed, or already in this end state.
        await this.settle(identity, { state: identity.state, lastError: null }, now);
        if (!identity.gymMemberId) await db.zktecoMember.deleteMany({ where: { id: identity.id } });
        continue;
      }
      pushes.push({
        identity,
        push: await this.buildPush(identity, member, desired, target),
      });
    }

    const batches =
      target.type === 'device' ? chunk(pushes, DEVICE_BATCH_SIZE) : chunk(pushes, PUSH_LIMIT);
    for (const batch of batches) {
      let outcomes;
      try {
        outcomes = await this.gateway.apply(
          target,
          batch.map((b) => b.push),
          now,
        );
      } catch (error) {
        const reason = error instanceof ZktecoUnavailableError ? error.reason : 'unreachable';
        this.logger.warn(`ZKTeco push failed for gym ${gymId} (${reason})`);
        return { ...summary, error: reason };
      }
      for (const [index, outcome] of outcomes.entries()) {
        const { identity, push } = batch[index]!;
        if (!outcome.ok) {
          summary.failed += 1;
          await this.settle(
            identity,
            { state: identity.state, lastError: outcome.error ?? 'unknown' },
            now,
          );
          continue;
        }
        summary.synced += 1;
        if (!identity.gymMemberId && push.action === 'delete') {
          // The member is gone and so is their turnstile record: forget the PIN.
          await db.zktecoMember.deleteMany({ where: { id: identity.id } });
          continue;
        }
        const member = identity.gymMemberId ? members.get(identity.gymMemberId) : undefined;
        await this.settle(
          identity,
          {
            state: stateOf(push.action),
            lastError: outcome.error ?? null,
            ...(push.photo && member?.photoUrl ? { photoRef: member.photoUrl } : {}),
          },
          now,
        );
      }
    }
    return summary;
  }

  /**
   * Make sure each member who should be on the turnstile has an identity, and
   * mark existing identities for a push.
   */
  private async markMembers(
    gymId: string,
    memberIds: string[],
    target: ZktecoTarget,
    now: Date,
  ): Promise<number> {
    if (memberIds.length === 0) return 0;
    const db = this.prisma.client;
    let marked = 0;
    for (const ids of chunk(memberIds, 500)) {
      const existing = await db.zktecoMember.findMany({
        where: { gymId, gymMemberId: { in: ids } },
        select: { gymMemberId: true },
      });
      const known = new Set(existing.map((e) => e.gymMemberId));
      if (known.size) {
        const { count } = await db.zktecoMember.updateMany({
          where: { gymId, gymMemberId: { in: [...known] as string[] } },
          data: { dirty: true },
        });
        marked += count;
      }
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length === 0) continue;
      const members = await db.gymMember.findMany({
        where: { gymId, id: { in: unknown }, role: Role.MEMBER },
        select: MEMBER_SELECT,
      });
      for (const member of members) {
        if (desiredState(member, target.options, target.type, now).action !== 'activate') continue;
        if (await this.createIdentity(gymId, member.id)) marked += 1;
      }
    }
    return marked;
  }

  /**
   * Allocate the next free PIN for a member. Concurrent allocators collide on the
   * `(gymId, pin)` unique index and try the next number; a member who already
   * got one through another run keeps it.
   */
  private async createIdentity(gymId: string, gymMemberId: string): Promise<boolean> {
    const db = this.prisma.client;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const max = await db.zktecoMember.aggregate({ where: { gymId }, _max: { deviceUid: true } });
      const next = Math.max((max._max.deviceUid ?? FIRST_PIN - 1) + 1, FIRST_PIN);
      if (next > LAST_PIN) {
        this.logger.warn(`ZKTeco PIN range exhausted for gym ${gymId}`);
        return false;
      }
      try {
        await db.zktecoMember.create({
          data: { gymId, gymMemberId, pin: String(next), deviceUid: next, dirty: true },
        });
        return true;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
        const mine = await db.zktecoMember.findFirst({ where: { gymId, gymMemberId } });
        if (mine) return false;
      }
    }
    return false;
  }

  private async buildPush(
    identity: { pin: string; state: string; photoRef: string | null },
    member: MemberRow | null,
    desired: DesiredState,
    target: ZktecoTarget,
  ): Promise<MemberPush> {
    const action = desired.action === 'none' ? 'delete' : desired.action;
    const name = displayName(member);
    const [firstName = '', ...rest] = name.split(' ');
    const photoUrl = member?.photoUrl ?? null;
    const wantsPhoto =
      action === 'activate' &&
      target.type === 'zkbio' &&
      target.options.syncPhoto &&
      photoUrl !== identity.photoRef;
    return {
      pin: identity.pin,
      action,
      name,
      firstName: member?.firstName?.trim() || firstName,
      lastName: member?.lastName?.trim() || rest.join(' '),
      cardNumber: member?.accessCardNumber ?? null,
      validFrom: desired.validFrom,
      validUntil: desired.validUntil,
      photo: wantsPhoto && photoUrl ? await this.photos.load(photoUrl) : null,
      previousState: identity.state,
    };
  }

  /**
   * Record a push result. The mark is cleared only when nothing re-marked the
   * identity while it was being pushed (its `updatedAt` is unchanged); otherwise
   * it stays marked and goes out again next run.
   */
  private async settle(
    identity: { id: string; updatedAt: Date },
    data: { state: string; lastError: string | null; photoRef?: string },
    now: Date,
  ): Promise<void> {
    const db = this.prisma.client;
    const { count } = await db.zktecoMember.updateMany({
      where: { id: identity.id, updatedAt: identity.updatedAt },
      data: { ...data, dirty: false, syncedAt: now },
    });
    if (count === 0) {
      await db.zktecoMember.updateMany({
        where: { id: identity.id },
        data: { ...data, syncedAt: now },
      });
    }
  }
}

/** The stored `ZktecoMember.state` for an applied action. */
function stateOf(action: MemberAction): string {
  return action === 'activate' ? 'active' : action;
}

function displayName(member: MemberRow | null): string {
  if (!member) return '';
  const split = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return (split || member.user.name || '').trim();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
