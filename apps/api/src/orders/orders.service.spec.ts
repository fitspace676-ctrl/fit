import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SendReceiptInput } from '@fit/types';
import type { EmailService } from '../auth/email.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { OrdersService } from './orders.service';

const input: SendReceiptInput = {
  email: 'buyer@example.com',
  receipt: {
    currency: 'USD',
    items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
    subtotal: 500,
    discountTotal: 0,
    total: 500,
    paymentMethod: 'cash',
    cashTendered: 1000,
    changeDue: 500,
  },
};

function setup(over?: { gymName?: string | null; delivered?: boolean }) {
  const sendReceiptEmail = vi.fn<() => Promise<boolean>>(() =>
    Promise.resolve(over?.delivered ?? true),
  );
  const findUnique = vi.fn(() =>
    Promise.resolve(over?.gymName === undefined ? { name: 'Downtown' } : { name: over.gymName }),
  );
  const email = { sendReceiptEmail } as unknown as EmailService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const prisma = {
    client: { gym: { findUnique } },
  } as unknown as TenantPrismaService;
  return { service: new OrdersService(email, tenant, prisma), sendReceiptEmail, findUnique };
}

describe('OrdersService.sendReceipt', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves the tenant gym name and forwards it to the email service', async () => {
    const { service, sendReceiptEmail, findUnique } = setup();

    const result = await service.sendReceipt(input);

    expect(result).toEqual({ delivered: true });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'gym-1' }, select: { name: true } });
    expect(sendReceiptEmail).toHaveBeenCalledWith('buyer@example.com', input.receipt, 'Downtown');
  });

  it('passes undefined for the gym name when the tenant lookup misses', async () => {
    const { service, sendReceiptEmail } = setup({ gymName: null });

    await service.sendReceipt(input);

    expect(sendReceiptEmail).toHaveBeenCalledWith('buyer@example.com', input.receipt, undefined);
  });

  it('reports delivered:false when email delivery is unconfigured', async () => {
    const { service } = setup({ delivered: false });

    expect(await service.sendReceipt(input)).toEqual({ delivered: false });
  });
});
