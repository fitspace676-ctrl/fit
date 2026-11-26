import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, Role, type GymIntegration as IntegrationRecord } from '@fit/db';
import {
  ZKTECO_CAPABILITIES,
  zktecoSettingsSchema,
  type ConnectZktecoInput,
  type UpdateZktecoSettingsInput,
  type ZktecoConnectionInfo,
  type ZktecoDoorTarget,
  type ZktecoFailureReason,
  type ZktecoInsideResponse,
  type ZktecoIntegration,
  type ZktecoOpenDoorResponse,
  type ZktecoResources,
  type ZktecoSettings,
  type ZktecoSyncStartResponse,
  type ZktecoSyncStatus,
  type ZktecoTestResponse,
} from '@fit/types';
import { SecretBox } from '../../common/crypto/secret-box';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { normalizeBaseUrl } from '../zkbio/zkbio-url';
import { coerceForType, readStored, unsupportedSetting, type StoredZkteco } from './zkteco-config';
import { ZktecoGateway, ZktecoUnavailableError } from './zkteco-gateway';
import { ZktecoJobs } from './zkteco-jobs.service';
import { ZKTECO_PROVIDER, ZktecoTargets, toTarget } from './zkteco-targets.service';

type TenantTx = Parameters<Parameters<TenantPrismaService['client']['$transaction']>[0]>[0];

/** Settings whose change alters what every member's turnstile record should be. */
const RESYNC_KEYS: (keyof ZktecoSettings)[] = [
  'syncMembers',
  'syncCard',
  'syncPhoto',
  'accessLevelIds',
  'entranceLevelIds',
  'onExpiry',
  'blockOnFreeze',
  'timeZone',
];

/**
 * The owner's ZKTeco card, plus the two reception actions (open door, who is
 * inside). Mirrors the Flitt/Sender handling in `IntegrationsService`: verify
 * before storing, encrypt the token/comm key, return only a hint, audit every
 * change, refuse anyone but the OWNER for configuration.
 */
@Injectable()
export class ZktecoIntegrationService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly secrets: SecretBox,
    private readonly gateway: ZktecoGateway,
    private readonly targets: ZktecoTargets,
    private readonly jobs: ZktecoJobs,
  ) {}

  /** Explicit OWNER check: GymManage can be delegated by the role editor. */
  private ownerGym(): string {
    if (this.tenant.role !== 'OWNER' || !this.tenant.userId) {
      throw new ForbiddenException({
        code: 'INTEGRATIONS_OWNER_ONLY',
        message: 'Only the gym owner can manage integrations',
      });
    }
    return this.tenant.gymId;
  }

  async get(): Promise<ZktecoIntegration> {
    const gymId = this.ownerGym();
    return toRead(await this.row(gymId));
  }

  async connect(input: ConnectZktecoInput): Promise<ZktecoIntegration> {
    const gymId = this.ownerGym();
    const { connection, secret, hint } = normalizeConnect(input);
    const existing = await this.row(gymId);
    const stored = readStored(existing?.settings);
    const options = coerceForType(connection.connectionType, stored.options);
    const result = await this.gateway.check(toTarget(connection, secret, options));
    if (!result.ok) throw verificationFailed(result.reason ?? 'unreachable');

    const moved = !sameEndpoint(stored.connection, connection);
    const settings = { connection, options } satisfies StoredZkteco;
    const data = {
      merchantId: null,
      secretCiphertext: this.secrets.encrypt(secret),
      secretHint: hint,
      verifiedAt: new Date(),
      lastError: null,
      settings: settings as unknown as Prisma.InputJsonValue,
    };
    return this.prisma.client.$transaction(async (tx) => {
      const row = await tx.gymIntegration.upsert({
        where: { gymId_provider: { gymId, provider: ZKTECO_PROVIDER } },
        create: { gymId, provider: ZKTECO_PROVIDER, ...data },
        update: data,
      });
      if (moved) {
        // Another server or device: nobody is on it yet and its event log is new.
        await tx.zktecoMember.updateMany({
          where: { gymId },
          data: { state: 'none', dirty: true, photoRef: null, lastError: null },
        });
        await tx.zktecoSyncState.upsert({
          where: { gymId },
          create: { gymId },
          update: { eventCursor: null, lastSyncAt: null, lastReconcileAt: null },
        });
      }
      await this.audit(tx, gymId, 'integration.connected', { type: connection.connectionType });
      return toRead(row);
    });
  }

  async test(): Promise<ZktecoTestResponse> {
    const gymId = this.ownerGym();
    const row = await this.row(gymId);
    if (!row?.secretCiphertext) throw notConnected();
    const target = await this.targets.load(gymId, { enabledOnly: false });
    if (!target) throw notConnected();
    const result = await this.gateway.check(target);
    await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.gymIntegration.updateMany({
        where: { id: row.id, gymId, secretCiphertext: row.secretCiphertext },
        data: result.ok
          ? { verifiedAt: new Date(), lastError: null }
          : { verifiedAt: null, lastError: result.reason ?? 'unreachable', enabled: false },
      });
      if (changed.count === 0) throw changedCredentials();
      await this.audit(tx, gymId, 'integration.tested');
    });
    return result;
  }

  async setEnabled(enabled: boolean): Promise<ZktecoIntegration> {
    const gymId = this.ownerGym();
    const read = await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.gymIntegration.updateMany({
        where: {
          gymId,
          provider: ZKTECO_PROVIDER,
          ...(enabled ? { secretCiphertext: { not: null }, verifiedAt: { not: null } } : {}),
        },
        data: { enabled },
      });
      if (enabled && changed.count === 0) throw notConnected();
      await this.audit(tx, gymId, enabled ? 'integration.enabled' : 'integration.disabled');
      return toRead(
        await tx.gymIntegration.findUnique({
          where: { gymId_provider: { gymId, provider: ZKTECO_PROVIDER } },
        }),
      );
    });
    // Switching on starts the first full push; the card follows it on the status.
    if (enabled) await this.jobs.requestFullSync(gymId).catch(() => undefined);
    return read;
  }

  async updateSettings(patch: UpdateZktecoSettingsInput): Promise<ZktecoIntegration> {
    const gymId = this.ownerGym();
    const row = await this.row(gymId);
    const stored = readStored(row?.settings);
    if (!row || !stored.connection) throw notConnected();
    const parsed = zktecoSettingsSchema.safeParse({ ...stored.options, ...patch });
    if (!parsed.success) throw new BadRequestException('Invalid integration parameters');
    const options = parsed.data;
    const field = unsupportedSetting(stored.connection.connectionType, options);
    if (field) {
      throw new BadRequestException({
        code: 'ZKTECO_SETTING_UNSUPPORTED',
        message: 'This connection type does not support the setting',
        data: { field },
      });
    }
    await this.assertLocations(options.deviceLocations);
    const resync = RESYNC_KEYS.some(
      (key) => JSON.stringify(stored.options[key]) !== JSON.stringify(options[key]),
    );
    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.gymIntegration.update({
        where: { id: row.id },
        data: {
          settings: { connection: stored.connection, options } as unknown as Prisma.InputJsonValue,
        },
      });
      if (resync) {
        await tx.zktecoMember.updateMany({ where: { gymId }, data: { dirty: true } });
      }
      await this.audit(tx, gymId, 'integration.settings_updated', {
        fields: Object.keys(patch),
      });
      return toRead(updated);
    });
  }

  /**
   * Forget the connection and switch everything off. People already on the
   * server/device stay there: without a connection they cannot be removed, so
   * the card should tell the owner to disable the turnstile first if needed.
   * The options, PINs and the non-secret address are kept, so reconnecting to
   * the same server or device resumes where it stopped instead of treating
   * every member as new; only the token/comm key is erased.
   */
  disconnect(): Promise<ZktecoIntegration> {
    const gymId = this.ownerGym();
    return this.prisma.client.$transaction(async (tx) => {
      const row = await tx.gymIntegration.findUnique({
        where: { gymId_provider: { gymId, provider: ZKTECO_PROVIDER } },
      });
      const stored = readStored(row?.settings);
      await tx.gymIntegration.updateMany({
        where: { gymId, provider: ZKTECO_PROVIDER },
        data: {
          enabled: false,
          merchantId: null,
          secretCiphertext: null,
          secretHint: null,
          verifiedAt: null,
          lastError: null,
        },
      });
      await this.audit(tx, gymId, 'integration.disconnected');
      return toRead(null, stored.options);
    });
  }

  async resources(): Promise<ZktecoResources> {
    const gymId = this.ownerGym();
    const target = await this.targets.load(gymId, { enabledOnly: false });
    if (!target) throw notConnected();
    try {
      return await this.gateway.discover(target);
    } catch (error) {
      throw unreachable(error);
    }
  }

  async status(): Promise<ZktecoSyncStatus> {
    const gymId = this.ownerGym();
    const db = this.prisma.client;
    const [state, synced, pending, failed, running] = await Promise.all([
      db.zktecoSyncState.findFirst({ where: { gymId } }),
      db.zktecoMember.count({
        where: { gymId, dirty: false, lastError: null, gymMemberId: { not: null } },
      }),
      db.zktecoMember.count({ where: { gymId, dirty: true } }),
      db.zktecoMember.count({ where: { gymId, dirty: false, lastError: { not: null } } }),
      this.jobs.isFullSyncRunning(gymId),
    ]);
    return {
      running,
      lastSyncAt: iso(state?.lastSyncAt),
      lastReconcileAt: iso(state?.lastReconcileAt),
      lastImportAt: iso(state?.lastImportAt),
      lastEventAt: iso(state?.lastEventAt),
      members: { synced, pending, failed },
      events: {
        imported: state?.eventsImported ?? 0,
        ignoredUnknown: state?.eventsIgnored ?? 0,
      },
      lastError: state?.lastError ?? null,
      lastErrorAt: iso(state?.lastErrorAt),
    };
  }

  async requestSync(): Promise<ZktecoSyncStartResponse> {
    const gymId = this.ownerGym();
    return this.jobs.requestFullSync(gymId);
  }

  /**
   * Open the configured door or gate once. Any staff role allowed to record a
   * check-in may (the controller's permission); only the OWNER may name another
   * door than the card's choice. Never retried, and audited either way.
   */
  async openDoor(override?: ZktecoDoorTarget): Promise<ZktecoOpenDoorResponse> {
    const gymId = this.tenant.gymId;
    if (override && this.tenant.role !== Role.OWNER) {
      throw new ForbiddenException({
        code: 'INTEGRATIONS_OWNER_ONLY',
        message: 'Only the gym owner can choose another door',
      });
    }
    const target = await this.targets.load(gymId, { enabledOnly: true });
    if (!target) throw notConnected();
    const door = override ?? target.options.checkInDoor;
    const result = await this.gateway.openDoor(target, door, target.options.openSeconds);
    await this.prisma.client.auditLog.create({
      data: {
        gymId,
        actorId: this.tenant.userId!,
        action: 'zkteco.door_opened',
        targetId: gymId,
        metadata: {
          provider: ZKTECO_PROVIDER,
          door: door ? `${door.kind}:${door.id}` : null,
          ok: result.ok,
          ...(result.reason ? { reason: result.reason } : {}),
        },
      },
    });
    return result;
  }

  /** zkbio only: who the server counts inside the card's zone (or the one asked for). */
  async inside(zone?: string): Promise<ZktecoInsideResponse> {
    const gymId = this.tenant.gymId;
    const target = await this.targets.load(gymId, { enabledOnly: true });
    if (!target) throw notConnected();
    if (target.type !== 'zkbio') {
      throw new ConflictException({
        code: 'ZKTECO_UNSUPPORTED',
        message: 'A standalone device cannot tell who is inside',
      });
    }
    const zoneCode = zone ?? target.options.insideZoneCode;
    if (!zoneCode) {
      throw new BadRequestException({
        code: 'ZKTECO_ZONE_REQUIRED',
        message: 'Choose the zone on the ZKTeco card first',
      });
    }
    let occupants;
    try {
      occupants = await this.gateway.whoIsInside(target, zoneCode);
    } catch (error) {
      throw unreachable(error);
    }
    const pins = [...new Set(occupants.map((o) => String(o.pin)))];
    const identities = pins.length
      ? await this.prisma.client.zktecoMember.findMany({
          where: { gymId, pin: { in: pins } },
          select: {
            pin: true,
            gymMemberId: true,
            member: {
              select: { firstName: true, lastName: true, user: { select: { name: true } } },
            },
          },
        })
      : [];
    const byPin = new Map(identities.map((i) => [i.pin, i]));
    return {
      zoneCode,
      people: pins.map((pin) => {
        const identity = byPin.get(pin);
        const member = identity?.member;
        const split = [member?.firstName, member?.lastName].filter(Boolean).join(' ');
        return {
          pin,
          gymMemberId: identity?.gymMemberId ?? null,
          name: member ? split || member.user.name || null : null,
        };
      }),
    };
  }

  /** Staff: set or clear a member's access card; the next sync carries it to the turnstile. */
  async setMemberCard(
    gymMemberId: string,
    cardNumber: string | null,
  ): Promise<{ gymMemberId: string; cardNumber: string | null }> {
    const gymId = this.tenant.gymId;
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: gymMemberId, role: Role.MEMBER },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({ message: 'Member not found', code: 'MEMBER_NOT_FOUND' });
    }
    try {
      await this.prisma.client.gymMember.update({
        where: { id: member.id },
        data: { accessCardNumber: cardNumber },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: 'ACCESS_CARD_IN_USE',
          message: 'This card already belongs to another member',
        });
      }
      throw error;
    }
    await this.prisma.client.zktecoMember.updateMany({
      where: { gymId, gymMemberId: member.id },
      data: { dirty: true },
    });
    return { gymMemberId: member.id, cardNumber };
  }

  private row(gymId: string): Promise<IntegrationRecord | null> {
    return this.prisma.client.gymIntegration.findUnique({
      where: { gymId_provider: { gymId, provider: ZKTECO_PROVIDER } },
    });
  }

  /** Every mapped branch must be one of this gym's (the scoped client sees no other). */
  private async assertLocations(mapping: Record<string, string>): Promise<void> {
    const ids = [...new Set(Object.values(mapping))];
    if (ids.length === 0) return;
    const found = await this.prisma.client.location.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException({
        code: 'LOCATION_NOT_FOUND',
        message: 'A mapped branch does not exist',
      });
    }
  }

  private async audit(
    tx: TenantTx,
    gymId: string,
    action: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        gymId,
        actorId: this.tenant.userId!,
        action,
        targetId: gymId,
        metadata: { provider: ZKTECO_PROVIDER, ...extra } as Prisma.InputJsonValue,
      },
    });
  }
}

/** Validate and split the connect body into the stored half, the secret and its hint. */
function normalizeConnect(input: ConnectZktecoInput): {
  connection: ZktecoConnectionInfo;
  secret: string;
  hint: string | null;
} {
  if (input.connectionType === 'zkbio') {
    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(input.baseUrl);
    } catch {
      throw verificationFailed('invalid_connection');
    }
    return {
      connection: {
        connectionType: 'zkbio',
        baseUrl,
        host: null,
        port: null,
        deviceNumber: null,
        recordSize: null,
      },
      secret: input.apiToken,
      // For very short tokens omit the hint rather than disclose the whole secret.
      hint: input.apiToken.length > 2 ? input.apiToken.slice(-2) : null,
    };
  }
  return {
    connection: {
      connectionType: 'device',
      baseUrl: null,
      host: input.host,
      port: input.port,
      deviceNumber: input.deviceNumber,
      recordSize: input.recordSize ?? null,
    },
    secret: String(input.commKey),
    // A numeric comm key is short; any hint would give most of it away.
    hint: null,
  };
}

function sameEndpoint(a: ZktecoConnectionInfo | null, b: ZktecoConnectionInfo): boolean {
  if (!a || a.connectionType !== b.connectionType) return false;
  return a.connectionType === 'zkbio'
    ? a.baseUrl === b.baseUrl
    : a.host === b.host && a.port === b.port;
}

function toRead(row: IntegrationRecord | null, fallback?: ZktecoSettings): ZktecoIntegration {
  const stored = readStored(row?.settings);
  const connection = row?.secretCiphertext ? stored.connection : null;
  return {
    provider: 'zkteco',
    connected: Boolean(connection),
    enabled: Boolean(connection) && (row?.enabled ?? false),
    connection,
    secretHint: connection ? (row?.secretHint ?? null) : null,
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    settings: fallback ?? stored.options,
    capabilities: connection ? ZKTECO_CAPABILITIES[connection.connectionType] : null,
  };
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function verificationFailed(reason: ZktecoFailureReason): Error {
  const body = {
    code: 'ZKTECO_VERIFICATION_FAILED',
    message: 'ZKTeco connection could not be verified',
    data: { reason },
  };
  if (reason === 'unreachable' || reason === 'timeout')
    return new ServiceUnavailableException(body);
  return new BadRequestException(body);
}

function unreachable(error: unknown): Error {
  if (!(error instanceof ZktecoUnavailableError)) return error as Error;
  return new ServiceUnavailableException({
    code: 'ZKTECO_UNREACHABLE',
    message: 'The ZKTeco server or device did not answer',
    data: { reason: error.reason },
  });
}

function notConnected(): ConflictException {
  return new ConflictException({
    code: 'ZKTECO_NOT_VERIFIED',
    message: 'Connect and verify the ZKTeco server or device first',
  });
}

function changedCredentials(): ConflictException {
  return new ConflictException({
    code: 'ZKTECO_CREDENTIALS_CHANGED',
    message: 'Credentials changed during verification; retry',
  });
}
