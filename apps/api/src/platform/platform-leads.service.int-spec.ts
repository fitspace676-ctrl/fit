import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { PlatformLeadType } from '@fit/db';
import { PlatformLeadsService } from './platform-leads.service';
import { disconnect, prisma } from '../test/integration-db';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailerService } from '../mail/mailer.service';

/**
 * Platform lead capture (T8.2) proven against a real Postgres: a submitted lead is
 * persisted to the tenant-less `platform_leads` table with its enum mapped and its
 * optional fields normalised — the durable "capture" the marketing forms rely on,
 * independent of whether the team notification email goes out.
 */
const prismaService = { client: prisma } as unknown as PrismaService;
// Never actually mail in the integration test; the team notification is a
// best-effort side effect covered by the unit spec.
const mailer = {
  send: vi.fn().mockResolvedValue({ sent: false, id: null }),
} as unknown as MailerService;
const service = new PlatformLeadsService(prismaService, mailer);

describe('PlatformLeadsService (integration)', () => {
  beforeEach(async () => {
    mockEnv.PLATFORM_LEADS_EMAIL = undefined;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "platform_leads" RESTART IDENTITY CASCADE');
  });

  afterEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "platform_leads" RESTART IDENTITY CASCADE');
    await disconnect();
  });

  it('persists a trial lead with the TRIAL enum and its business name', async () => {
    const { id } = await service.create({
      type: 'trial',
      name: 'David Iobashvili',
      email: 'david@ironworks.ge',
      business: 'IronWorks Fitness',
    });

    const stored = await prisma.platformLead.findUnique({ where: { id } });
    expect(stored).not.toBeNull();
    expect(stored?.type).toBe(PlatformLeadType.TRIAL);
    expect(stored?.email).toBe('david@ironworks.ge');
    expect(stored?.business).toBe('IronWorks Fitness');
    expect(stored?.phone).toBeNull();
    expect(stored?.message).toBeNull();
  });

  it('persists a demo lead with the DEMO enum, its phone and message, and no business', async () => {
    const { id } = await service.create({
      type: 'demo',
      name: 'Nino K',
      email: 'nino@studio.ge',
      phone: '+995 555 12 34 56',
      message: 'Bookings and the member app',
    });

    const stored = await prisma.platformLead.findUnique({ where: { id } });
    expect(stored?.type).toBe(PlatformLeadType.DEMO);
    expect(stored?.business).toBeNull();
    expect(stored?.phone).toBe('+995 555 12 34 56');
    expect(stored?.message).toBe('Bookings and the member app');
  });
});
