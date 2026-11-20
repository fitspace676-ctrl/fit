import { SenderClient } from './sender/sender-client';
import { normalizeGeorgianMobile } from '../sms/normalize-phone';
import type { ConnectSenderInput, SendTestSmsResponse, IntegrationProvider } from '@fit/types';
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
    private readonly sender: SenderClient,
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
    const sender = await this.prisma.client.gymIntegration.findUnique({
      where: { gymId_provider: { gymId, provider: 'sender' } },
    });
    return [toRead(row), toRead(sender, 'sender')];
  }

  async connectSender(input: ConnectSenderInput): Promise<GymIntegration> {
    const gymId = this.ownerGym();
    const result = await this.sender.getBalance(input.apiKey);
    if (!result.ok) {
      const body = {
        code: 'SENDER_VERIFICATION_FAILED',
        message: 'Sender credentials could not be verified',
        data: { reason: result.reason },
      };
      if (result.reason === 'unreachable') throw new ServiceUnavailableException(body);
      throw new BadRequestException(body);
    }
    const data = {
      merchantId: null,
      secretCiphertext: this.secrets.encrypt(input.apiKey),
      secretHint: input.apiKey.length > 2 ? input.apiKey.slice(-2) : null,
      verifiedAt: new Date(),
      lastError: null,
    };
    return this.prisma.client.$transaction(async (tx) => {
      const row = await tx.gymIntegration.upsert({
        where: { gymId_provider: { gymId, provider: 'sender' } },
        create: { gymId, provider: 'sender', ...data },
        update: data,
      });
      await this.audit(tx, gymId, 'integration.connected', 'sender');
      return toRead(row, 'sender');
    });
  }

  async testSender(): Promise<TestIntegrationResponse> {
    const gymId = this.ownerGym();
    const row = await this.prisma.client.gymIntegration.findUnique({
      where: { gymId_provider: { gymId, provider: 'sender' } },
    });
    if (!row?.secretCiphertext) throw notConnected('sender');
    const result = await this.sender.getBalance(this.secrets.decrypt(row.secretCiphertext));
    await this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.gymIntegration.updateMany({
        where: { id: row.id, gymId, secretCiphertext: row.secretCiphertext },
        data: result.ok
          ? { verifiedAt: new Date(), lastError: null }
          : { verifiedAt: null, lastError: result.reason, enabled: false },
      });
      if (changed.count === 0) throw changedCredentials('sender');
      await this.audit(tx, gymId, 'integration.tested', 'sender');
    });
    return result;
  }

  async sendTestSms(phone: string): Promise<SendTestSmsResponse> {
    const gymId = this.ownerGym();
    const key = await this.getActiveSenderKey(gymId);
    if (!key) throw notConnected('sender');
    const destination = normalizeGeorgianMobile(phone);
    if (!destination) return { ok: false, reason: 'invalid_phone' };
    const result = await this.sender.send(key, {
      destination,
      content: 'სატესტო შეტყობინება: SMS ინტეგრაცია მუშაობს.',
      smsno: 2,
    });
    return result.ok ? { ok: true } : result;
  }

  /** Explicit scope supports scheduled jobs without a tenant ALS store. */
  async getActiveSenderKey(gymId: string): Promise<string | null> {
    this.assertInternalGym(gymId);
    const row = await this.internalPrisma.client.gymIntegration.findFirst({
      where: { gymId, provider: 'sender', enabled: true, verifiedAt: { not: null } },
      select: { secretCiphertext: true },
    });
    return row?.secretCiphertext ? this.secrets.decrypt(row.secretCiphertext) : null;
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

  async setEnabled(
    enabled: boolean,
    provider: IntegrationProvider = 'flitt',
  ): Promise<GymIntegration> {
    const gymId = this.ownerGym();
    return this.prisma.client.$transaction(async (tx) => {
      const changed = await tx.gymIntegration.updateMany({
        where: {
          gymId,
          provider,
          ...(enabled
            ? {
                ...(provider === 'flitt' ? { merchantId: { not: null } } : {}),
                secretCiphertext: { not: null },
                verifiedAt: { not: null },
              }
            : {}),
        },
        data: { enabled },
      });
      if (enabled && changed.count === 0) throw notConnected(provider);
      await this.audit(
        tx,
        gymId,
        enabled ? 'integration.enabled' : 'integration.disabled',
        provider,
      );
      return toRead(
        await tx.gymIntegration.findUnique({
          where: { gymId_provider: { gymId, provider } },
        }),
        provider,
      );
    });
  }

  async disconnect(provider: IntegrationProvider = 'flitt'): Promise<GymIntegration> {
    const gymId = this.ownerGym();
    return this.prisma.client.$transaction(async (tx) => {
      await tx.gymIntegration.updateMany({
        where: { gymId, provider },
        data: {
          enabled: false,
          merchantId: null,
          secretCiphertext: null,
          secretHint: null,
          verifiedAt: null,
          lastError: null,
        },
      });
      await this.audit(tx, gymId, 'integration.disconnected', provider);
      return toRead(null, provider);
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

  private async audit(
    tx: TenantTx,
    gymId: string,
    action: string,
    provider: IntegrationProvider = 'flitt',
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        gymId,
        actorId: this.tenant.userId!,
        action,
        targetId: gymId,
        metadata: { provider },
      },
    });
  }
}

function toRead(
  row: IntegrationRecord | null,
  provider: IntegrationProvider = 'flitt',
): GymIntegration {
  return {
    provider,
    connected: Boolean(row?.secretCiphertext && (provider === 'sender' || row.merchantId)),
    enabled: row?.enabled ?? false,
    merchantId: provider === 'sender' ? null : (row?.merchantId ?? null),
    secretHint: row?.secretHint ?? null,
    verifiedAt: row?.verifiedAt?.toISOString() ?? null,
    lastError: row?.lastError ?? null,
    testMode: provider === 'flitt' && row?.merchantId === '1549901',
  };
}
function notConnected(provider: IntegrationProvider = 'flitt'): ConflictException {
  return new ConflictException({
    code: `${provider.toUpperCase()}_NOT_VERIFIED`,
    message: `Connect and verify ${provider} credentials first`,
  });
}
function changedCredentials(provider: IntegrationProvider = 'flitt'): ConflictException {
  return new ConflictException({
    code: `${provider.toUpperCase()}_CREDENTIALS_CHANGED`,
    message: 'Credentials changed during verification; retry',
  });
}
