import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { InvoiceDocumentService } from '../billing/invoice-document.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { MeInvoicesService } from './me-invoices.service';

function setup(opts: { userId?: string | null; member?: { id: string } | null } = {}) {
  const findFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(opts.member ?? null);
  const prisma = {
    client: { gymMember: { findFirst } },
  } as unknown as TenantPrismaService;
  const userId = 'userId' in opts ? opts.userId : 'user-1';
  const tenant = { userId } as unknown as TenantContext;
  const getPdf = vi
    .fn<(id: string, scope?: unknown) => Promise<unknown>>()
    .mockResolvedValue({ buffer: Buffer.from('%PDF'), number: '2026-0001' });
  const documents = { getPdf } as unknown as InvoiceDocumentService;

  return { service: new MeInvoicesService(prisma, tenant, documents), findFirst, getPdf };
}

describe('MeInvoicesService', () => {
  it('rejects a request without a member session', async () => {
    const { service } = setup({ userId: null });
    await expect(service.getInvoicePdf('inv-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns null when the caller is not a member of the gym', async () => {
    const { service, getPdf } = setup({ member: null });
    await expect(service.getInvoicePdf('inv-1')).resolves.toBeNull();
    expect(getPdf).not.toHaveBeenCalled();
  });

  it('resolves the caller and delegates with a member scope', async () => {
    const { service, findFirst, getPdf } = setup({ userId: 'user-7', member: { id: 'gm-7' } });

    const result = await service.getInvoicePdf('inv-1');

    expect((findFirst.mock.calls[0]?.[0] as { where: unknown }).where).toMatchObject({
      userId: 'user-7',
    });
    expect(getPdf).toHaveBeenCalledWith('inv-1', { memberId: 'gm-7' });
    expect(result).toMatchObject({ number: '2026-0001' });
  });
});
