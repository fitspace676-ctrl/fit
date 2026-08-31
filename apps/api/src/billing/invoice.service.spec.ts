import { describe, expect, it, vi } from 'vitest';
import { InvoiceStatus } from '@fit/db';
import { formatInvoiceNumber } from '@fit/types';
import { InvoiceService, type InvoiceTxClient } from './invoice.service';

/**
 * A transaction stub: the counter bump returns `seq`, and the gym row carries
 * whatever Settings → Invoicing block the case is about (`undefined` = a gym that
 * never opened the settings screen, which defaults to `INV` / 1000 / prefix-year).
 */
function makeTx(seq = 1, invoice?: Record<string, unknown>, memberBranch: string | null = 'loc-1') {
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
  // The billed member, read for their home branch alone. `null` models both a
  // member with no branch and (via `mockResolvedValue(null)`) one that does not
  // resolve in this gym — the two cases the service collapses to an unattributed
  // invoice.
  const memberFindFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(memberBranch === null ? null : { locationId: memberBranch });
  const tx = {
    $queryRawUnsafe: queryRawUnsafe,
    invoice: { create },
    gym: { findFirst: gymFindFirst },
    gymMember: { findFirst: memberFindFirst },
  } as unknown as InvoiceTxClient;
  return { tx, create, queryRawUnsafe, gymFindFirst, memberFindFirst };
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

/**
 * `Invoice.locationId` — the branch snapshot Stage 5 stamps here.
 *
 * These live at the SEAM rather than at the four issuers (enrolment, renewal, a
 * booked service session, a hand-raised invoice) because that is where the rule
 * lives: all four call `issue`, none of them passes a branch, and none of them can
 * forget one. Testing here covers all four at once and pins the reason the lookup
 * is not a parameter.
 *
 * They also carry the whole weight of this column's coverage: the dev seed mints
 * no invoices at all, so nothing downstream — not the roster, not `outstanding`,
 * not the recurring stream — has a seeded row with a branch on it to exercise.
 */
describe('InvoiceService.issue — the branch snapshot', () => {
  const service = new InvoiceService();

  it('stamps the billed member’s home branch onto the invoice', async () => {
    const { tx, create, memberFindFirst } = makeTx(1, undefined, 'loc-flagship');

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      amount: 5000,
      currency: 'GEL',
    });

    // Pinned by `gymId` as well as `id`. The unscoped billing-job client injects no
    // tenant, so a `memberId` that resolved across tenants would copy another gym's
    // branch onto this invoice — a cross-tenant row the foreign key cannot catch,
    // because that location really does exist. The migration guards its backfill
    // the same way; this is the write-path half of that guard.
    expect(memberFindFirst).toHaveBeenCalledWith({
      where: { id: 'gm-1', gymId: 'gym-1' },
      select: { locationId: true },
    });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ locationId: 'loc-flagship' });
  });

  // The PERSON half of the attribution rule, and the one place it would be easy to
  // get wrong: an order is right there on the input. Taking the branch from it
  // would attribute the one-off minority one way and the recurring majority
  // another, and `outstanding` would mean something different row by row.
  it('takes the branch from the member even when the invoice names an order', async () => {
    const { tx, create } = makeTx(1, undefined, 'loc-satellite');

    await service.issue(tx, {
      gymId: 'gym-1',
      memberId: 'gm-1',
      orderId: 'ord-1',
      amount: 5000,
      currency: 'GEL',
    });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      orderId: 'ord-1',
      locationId: 'loc-satellite',
    });
  });

  // A member whose branch was retired (`GymMember.location` is `SetNull`). NOT
  // defaulted to the gym's main branch: this column has an attribution already, and
  // inventing one would credit a branch with a debt the console never showed there.
  it('leaves the branch null when the member has no home branch', async () => {
    const { tx, create } = makeTx(1, undefined, null);
    // A member row that exists but carries no branch — distinct from the
    // unresolvable case below, and it must land on the same answer.
    (tx as unknown as { gymMember: { findFirst: ReturnType<typeof vi.fn> } }).gymMember.findFirst =
      vi.fn().mockResolvedValue({ locationId: null });

    await service.issue(tx, { gymId: 'gym-1', memberId: 'gm-1', amount: 100, currency: 'GEL' });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({ locationId: null });
  });

  // A cross-tenant or deleted id: the pinned `where` finds nothing. Still an
  // invoice, still unattributed — never another gym's branch.
  it('leaves the branch null when the member does not resolve in this gym', async () => {
    const { tx, create } = makeTx(1, undefined, null);

    await service.issue(tx, { gymId: 'gym-1', memberId: 'gm-other', amount: 100, currency: 'GEL' });

    expect(create.mock.calls[0]?.[0].data).toMatchObject({ locationId: null });
  });

  // `memberId: null` is the recurring-billing edge — an invoice that survived a
  // member purge by `SetNull`. There is nothing to read, so the lookup is skipped
  // entirely rather than issued with a null id.
  it('skips the lookup and leaves the branch null when there is no member', async () => {
    const { tx, create, memberFindFirst } = makeTx(1);

    await service.issue(tx, { gymId: 'gym-1', memberId: null, amount: 100, currency: 'GEL' });

    expect(memberFindFirst).not.toHaveBeenCalled();
    expect(create.mock.calls[0]?.[0].data).toMatchObject({ locationId: null });
  });
});
