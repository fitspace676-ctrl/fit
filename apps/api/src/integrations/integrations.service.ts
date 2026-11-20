import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { GymIntegration as IntegrationRecord } from '@fit/db';
import type { ConnectFlittInput, GymIntegration, TestIntegrationResponse } from '@fit/types';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecretBox } from '../common/crypto/secret-box';
import { FlittClient, type FlittCredentials } from './flitt/flitt-client';

/** The tenant-scoped transaction client `TenantPrismaService.client.$transaction` hands its callback. */
type TenantTx = Parameters<Parameters<TenantPrismaService['client']['$transaction']>[0]>[0];

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly flitt: FlittClient,
    private readonly secrets: SecretBox,
    private readonly internalPrisma: PrismaService,
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

  async list(): Promise<GymIntegration[]> {
    const gymId = this.ownerGym();
    const row = await this.prisma.client.gymIntegration.findUnique({
      where: { gymId_provider: { gymId, provider: 'flitt' } },
    });
    return [toRead(row)];
  }

  async connect(input: ConnectFlittInput): Promise<GymIntegration> {
    const gymId = this.ownerGym();
    const result = await this.flitt.verifyCredentials(input);
    if (!result.ok) {
      const body = {
        code: 'FLITT_VERIFICATION_FAILED',
        message: 'Flitt credentials could not be verified',
        data: { reason: result.reason },
      };
      if (result.reason === 'unreachable') throw new ServiceUnavailableException(body);
      throw new BadRequestException(body);
    }
    const data = {
      merchantId: input.merchantId,
      secretCiphertext: this.secrets.encrypt(input.secretKey),
      // For very short keys omit the hint rather than disclose the whole secret.
      secretHint: input.secretKey.length > 2 ? input.secretKey.slice(-2) : null,
      verifiedAt: new Date(),
      lastError: null,
    };
    return this.prisma.client.$transaction(async (tx) => {
      const row = await tx.gymIntegration.upsert({
        where: { gymId_provider: { gymId, provider: 'flitt' } },
        create: { gymId, provider: 'flitt', ...data },
        update: data,
      });
      await this.audit(tx, gymId, 'integration.connected');
      return toRead(row);
    });
  }

  async test(): Promise<TestIntegrationResponse> {
    const gymId = this.ownerGym();
    const row = await this.prisma.client.gymIntegration.findUnique({
      where: { gymId_provider: { gymId, provider: 'flitt' } },
    });
    if (!row?.merchantId || !row.secretCiphertext) throw notConnected();
    const result = await this.flitt.verifyCredentials({
      merchantId: row.merchantId,
      secretKey: this.secrets.decrypt(row.secretCiphertext),
    });
    await this.prisma.client.$transaction(async (tx) => {
      // Do not stamp a concurrently replaced/disconnected key as verified.
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

  async setEnabled(enabled: boolean): Promise<GymIntegration> {
    const gymId = this.ownerGym();
    return this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.gymIntegration.updateMany({
        where: {
          gymId,
          provider: 'flitt',
          ...(enabled
            ? {
                merchantId: { not: null },
                secretCiphertext: { not: null },
                verifiedAt: { not: null },
              }
            : {}),
        },
        data: { enabled },
      });
      if (enabled && changed.count === 0) throw notConnected();
      await this.audit(tx, gymId, enabled ? 'integration.enabled' : 'integration.disabled');
      return toRead(
        await tx.gymIntegration.findUnique({
          where: { gymId_provider: { gymId, provider: 'flitt' } },
        }),
      );
    });
  }

  async disconnect(): Promise<GymIntegration> {
    const gymId = this.ownerGym();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.gymIntegration.updateMany({
        where: { gymId, provider: 'flitt' },
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
      return toRead(null);
    });
  }

  /** Internal only; explicit gym filter also supports jobs with no tenant ALS store. */
  async getActiveFlittCredentials(gymId: string): Promise<FlittCredentials | null> {
    this.assertInternalGym(gymId);
    const row = await this.internalPrisma.client.gymIntegration.findFirst({
      where: { gymId, provider: 'flitt', enabled: true, verifiedAt: { not: null } },
      select: { merchantId: true, secretCiphertext: true },
    });
    if (!row?.merchantId || !row.secretCiphertext) return null;
    return { merchantId: row.merchantId, secretKey: this.secrets.decrypt(row.secretCiphertext) };
  }

  /**
   * Internal only: the gym's stored Flitt credentials whether or not selling is
   * currently enabled. Settling (status reads) and refunding (reversals) payments
   * that were ALREADY taken must keep working after an owner switches online
   * sales off; starting a new payment must use {@link getActiveFlittCredentials}.
   */
  async getFlittCredentialsForSettlement(gymId: string): Promise<FlittCredentials | null> {
    this.assertInternalGym(gymId);
    const row = await this.internalPrisma.client.gymIntegration.findFirst({
      where: { gymId, provider: 'flitt' },
      select: { merchantId: true, secretCiphertext: true },
    });
    if (!row?.merchantId || !row.secretCiphertext) return null;
    return { merchantId: row.merchantId, secretKey: this.secrets.decrypt(row.secretCiphertext) };
  }

  async isOnlinePaymentEnabled(gymId: string): Promise<boolean> {
    this.assertInternalGym(gymId);
    return (
      (await this.internalPrisma.client.gymIntegration.count({
        where: {
          gymId,
          provider: 'flitt',
          enabled: true,
          merchantId: { not: null },
          secretCiphertext: { not: null },
          verifiedAt: { not: null },
        },
      })) > 0
    );
  }

  private assertInternalGym(gymId: string): void {
    if (!gymId || (this.tenant.current && this.tenant.current.gymId !== gymId)) {
      throw new ForbiddenException('Integration tenant mismatch');
    }
  }

  private async audit(tx: TenantTx, gymId: string, action: string): Promise<void> {
    await tx.auditLog.create({
      data: {
        gymId,
        actorId: this.tenant.userId!,
        action,
        targetId: gymId,
        metadata: { provider: 'flitt' },
      },
    });
  }
}

function toRead(row: IntegrationRecord | null): GymIntegration {
  return {
    provider: 'flitt',
    connected: Boolean(row?.merchantId && row.secretCiphertext),
    enabled: row?.enabled ?? false,
    merchantId: row?.merchantId ?? null,
    secretHint: row?.secretHint ?? null,
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    testMode: row?.merchantId === '1549901',
  };
}
function notConnected(): ConflictException {
  return new ConflictException({
    code: 'FLITT_NOT_VERIFIED',
    message: 'Connect and verify Flitt credentials first',
  });
}
function changedCredentials(): ConflictException {
  return new ConflictException({
    code: 'FLITT_CREDENTIALS_CHANGED',
    message: 'Credentials changed during verification; retry',
  });
}
