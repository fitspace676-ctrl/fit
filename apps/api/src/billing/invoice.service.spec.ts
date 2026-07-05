import { describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, formatInvoiceNumber } from '@fit/db';
import { InvoiceService, type InvoiceTxClient } from './invoice.service';

function makeTx(seq = 1) {
  const create = vi
    .fn<(args: { data: Record<string, unknown> }) => Promise<unknown>>()
    .mockImplementation((args) =>
      Promise.resolve({
        id: 'inv-1',
        number: args.data.number,
        seq: args.data.seq,
        year: args.data.year,
      }),
    );
  const queryRawUnsafe = vi
    .fn<(query: string, ...values: unknown[]) => Promise<unknown>>()
    .mockResolvedValue([{ lastNumber: seq }]);
  const tx = { $queryRawUnsafe: queryRawUnsafe, invoice: { create } } as unknown as InvoiceTxClient;
  return { tx, create, queryRawUnsafe };
}

describe('InvoiceService', () => {
  const service = new InvoiceService();

  it('allocates the next sequence and formats the invoice number for the fiscal year', async () => {
    const { tx, create, queryRawUnsafe } = makeTx(42);

    const result = await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      amount: 5000,
      currency: 'GEL',
      issuedAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    // The gymId + year are passed explicitly to the raw counter bump so it is
    // correct on the unscoped billing-job client too.
    expect(queryRawUnsafe.mock.calls[0]?.slice(1)).toEqual(['gym-1', 2026]);
    const created = create.mock.calls[0]?.[0].data;
    expect(created).toMatchObject({ seq: 42, year: 2026, number: formatInvoiceNumber(2026, 42) });
    expect(result).toEqual({
      id: 'inv-1',
      number: formatInvoiceNumber(2026, 42),
      seq: 42,
      year: 2026,
    });
  });

  it('defaults status to PAID and description/relations to their empty forms', async () => {
    const { tx, create } = makeTx();

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      amount: 1000,
      currency: 'USD',
      issuedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      status: InvoiceStatus.PAID,
      description: '',
      subscriptionId: null,
      orderId: null,
    });
  });

  it('passes explicit status, description and relation ids through', async () => {
    const { tx, create } = makeTx();

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      subscriptionId: 'sub-1',
      orderId: 'ord-1',
      amount: 2500,
      currency: 'GEL',
      status: InvoiceStatus.PENDING,
      description: 'Premium — monthly renewal',
      issuedAt: new Date('2026-05-01T00:00:00.000Z'),
    });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      subscriptionId: 'sub-1',
      orderId: 'ord-1',
      status: InvoiceStatus.PENDING,
      description: 'Premium — monthly renewal',
    });
  });

  it('derives the sequence year from issuedAt in UTC', async () => {
    const { tx, create } = makeTx(7);

    // 2025-12-31T23:30 UTC → fiscal year 2025, never rolled forward by local tz.
    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: null,
      amount: 100,
      currency: 'USD',
      issuedAt: new Date('2025-12-31T23:30:00.000Z'),
    });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({ year: 2025, memberId: null });
  });
});
