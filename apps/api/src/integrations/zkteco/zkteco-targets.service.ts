import { ForbiddenException, Injectable } from '@nestjs/common';
import { GymStatus } from '@fit/db';
import type { ZktecoConnectionInfo, ZktecoSettings } from '@fit/types';
import { SecretBox } from '../../common/crypto/secret-box';
import { TenantContext } from '../../common/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { readStored } from './zkteco-config';
import type { ZktecoTarget } from './zkteco-gateway';

export const ZKTECO_PROVIDER = 'zkteco';

/**
 * Resolves one gym's ZKTeco connection for the jobs and the owner endpoints:
 * stored settings + the decrypted token/comm key. Runs on the unscoped client
 * with an explicit `gymId` (the jobs have no tenant), and refuses a gym other
 * than the request's own when called inside one, like the Flitt accessors.
 */
@Injectable()
export class ZktecoTargets {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * The gym's target, or `null` when not connected. `enabledOnly` also requires
   * the owner to have switched it on after a successful verification; every
   * automatic action uses that, the owner's own test/discovery does not.
   */
  async load(gymId: string, options: { enabledOnly: boolean }): Promise<ZktecoTarget | null> {
    this.assertInternalGym(gymId);
    const row = await this.prisma.client.gymIntegration.findFirst({
      where: {
        gymId,
        provider: ZKTECO_PROVIDER,
        ...(options.enabledOnly ? { enabled: true, verifiedAt: { not: null } } : {}),
      },
      select: { secretCiphertext: true, settings: true },
    });
    if (!row?.secretCiphertext) return null;
    const stored = readStored(row.settings);
    if (!stored.connection) return null;
    return toTarget(stored.connection, this.secrets.decrypt(row.secretCiphertext), stored.options);
  }

  /** Gyms whose ZKTeco integration is on, for the jobs. Suspended gyms are left alone. */
  async enabledGymIds(): Promise<string[]> {
    const rows = await this.prisma.client.gymIntegration.findMany({
      where: {
        provider: ZKTECO_PROVIDER,
        enabled: true,
        verifiedAt: { not: null },
        secretCiphertext: { not: null },
        gym: { status: GymStatus.ACTIVE },
      },
      select: { gymId: true },
    });
    return rows.map((row) => row.gymId);
  }

  /** Record a job failure for the card, as a short reason code only. */
  async recordError(gymId: string, reason: string, now: Date): Promise<void> {
    this.assertInternalGym(gymId);
    await this.prisma.client.zktecoSyncState.upsert({
      where: { gymId },
      create: { gymId, lastError: reason, lastErrorAt: now },
      update: { lastError: reason, lastErrorAt: now },
    });
  }

  private assertInternalGym(gymId: string): void {
    if (!gymId || (this.tenant.current && this.tenant.current.gymId !== gymId)) {
      throw new ForbiddenException('Integration tenant mismatch');
    }
  }
}

/** Assemble a target from the stored half and the decrypted secret. */
export function toTarget(
  connection: ZktecoConnectionInfo,
  secret: string,
  options: ZktecoSettings,
): ZktecoTarget {
  if (connection.connectionType === 'zkbio') {
    return {
      type: 'zkbio',
      zkbio: { baseUrl: connection.baseUrl ?? '', apiToken: secret },
      options,
    };
  }
  return {
    type: 'device',
    device: {
      host: connection.host ?? '',
      port: connection.port ?? 4370,
      commKey: Number(secret) || 0,
      deviceNumber: connection.deviceNumber ?? 1,
    },
    recordSize: connection.recordSize,
    options,
  };
}
