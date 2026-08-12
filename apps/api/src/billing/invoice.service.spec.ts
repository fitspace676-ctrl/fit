import { describe, expect, it, vi } from 'vitest';
import { InvoiceStatus } from '@fit/db';
import { formatInvoiceNumber } from '@fit/types';
import { InvoiceService, type InvoiceTxClient } from './invoice.service';

/**
 * A transaction stub: the counter bump returns `seq`, and the gym row carries
 * whatever Settings → Invoicing block the case is about (`undefined` = a gym that
 * never opened the settings screen, which defaults to `INV` / 1000 / prefix-year).
 */
function makeTx(seq = 1, invoice?: Record<string, unknown>) {
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
  const gymFindFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue({ settings: invoice ? { invoice } : null });
  const tx = {
    $queryRawUnsafe: queryRawUnsafe,
    invoice: { create },
    gym: { findFirst: gymFindFirst },
  } as unknown as InvoiceTxClient;
  return { tx, create, queryRawUnsafe, gymFindFirst };
}

describe('InvoiceService', () => {
  const service = new InvoiceService();

  it('allocates the next sequence and stamps the gym’s configured reference', async () => {
    const { tx, create, queryRawUnsafe, gymFindFirst } = makeTx(42);

    const result = await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      amount: 5000,
      currency: 'GEL',
      issuedAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    // The settings are read for this gym specifically — `Gym` is the tenant root and
    // sits outside the scoped client's model set, so the id is pinned by hand.
    expect(gymFindFirst).toHaveBeenCalledWith({
      where: { id: 'gym-1' },
      select: { settings: true },
    });
    // The gymId + bucket + starting number are passed explicitly to the raw counter
    // bump so it is correct on the unscoped billing-job client too.
    expect(queryRawUnsafe.mock.calls[0]?.slice(1)).toEqual(['gym-1', 2026, 1000]);
    // Defaults: prefix `INV`, prefix-year-number.
    const expected = 'INV-2026-0042';
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ seq: 42, year: 2026, number: expected });
    expect(result).toEqual({ id: 'inv-1', number: expected, seq: 42, year: 2026 });
  });

  it('follows the gym’s prefix and shape', async () => {
    const { tx, create } = makeTx(7, { prefix: 'FC', format: 'year-number' });

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      amount: 100,
      currency: 'GEL',
      issuedAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    // `year-number` prints no prefix, whatever the gym typed into the field.
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ number: '2026-0007' });
  });

  it('passes the gym’s starting number to the counter, which floors the allocation', async () => {
    const { tx, queryRawUnsafe } = makeTx(5000, { startNumber: 5000 });

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: null,
      amount: 100,
      currency: 'GEL',
      issuedAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    expect(queryRawUnsafe.mock.calls[0]?.slice(1)).toEqual(['gym-1', 2026, 5000]);
    // GREATEST, not a plain seed: raising the setting takes effect on the next
    // invoice rather than next January.
    expect(queryRawUnsafe.mock.calls[0]?.[0]).toContain('GREATEST');
  });

  // `INV-1000` carries no year, so a per-year counter would hand the same reference
  // out again next January. That shape draws from one continuous gym-wide bucket.
  it('draws a year-less reference from the gym-wide counter bucket', async () => {
    const { tx, create, queryRawUnsafe } = makeTx(1000, { format: 'prefix-number' });

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: null,
      amount: 100,
      currency: 'GEL',
      issuedAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    expect(queryRawUnsafe.mock.calls[0]?.slice(1)).toEqual(['gym-1', 0, 1000]);
    // The row still records the true fiscal year even though the reference omits it.
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ number: 'INV-1000', year: 2026 });
  });

  it('still mints for a gym that has never opened the settings screen', async () => {
    const { tx, create, gymFindFirst } = makeTx(3);
    gymFindFirst.mockResolvedValue(null);

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: null,
      amount: 100,
      currency: 'GEL',
      issuedAt: new Date('2026-03-15T10:00:00.000Z'),
    });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({ number: 'INV-2026-0003' });
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

    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      year: 2025,
      memberId: null,
      number: formatInvoiceNumber(2025, 7, { prefix: 'INV', format: 'prefix-year-number' }),
    });
  });
});
