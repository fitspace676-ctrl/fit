import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GymStatus } from '@fit/db';
import { InvoiceService, type IssueInvoiceInput } from './invoice.service';
import { disconnect, prisma, resetDb } from '../test/integration-db';

/**
 * Invoice numbering proven against a real Postgres (T5.9): the sequence is generated
 * by the actual `INSERT … ON CONFLICT DO UPDATE … RETURNING` statement, so this
 * exercises what a unit spec can only fake — that numbers are sequential and gap-free
 * within a bucket, reset each fiscal year, are isolated per gym, and stay unique under
 * concurrent charges racing for the same bucket.
 *
 * The reference itself is composed from the gym's Settings → Invoicing, so a gym that
 * has never opened that screen (these fixtures) gets the schema defaults: the `INV`
 * prefix, the `prefix-year-number` shape, and a sequence starting at 1000. The two
 * SQL-level consequences of those settings — the starting number *flooring* the
 * allocation, and the year-less shape drawing from one gym-wide bucket — are only
 * observable against a real counter, so they are covered here rather than in the unit
 * spec.
 */
const service = new InvoiceService();

/** Issue one invoice inside its own transaction, as the enrolment / billing flows do. */
function issue(input: IssueInvoiceInput) {
  return prisma.$transaction((tx) => service.issue(tx, input));
}

const charge = (gymId: string, over?: Partial<IssueInvoiceInput>): IssueInvoiceInput => ({
  gymId,
  memberId: null,
  amount: 5000,
  currency: 'USD',
  issuedAt: new Date('2026-06-01T00:00:00.000Z'),
  ...over,
});

describe('InvoiceService (integration)', () => {
  let gymAId: string;
  let gymBId: string;

  beforeEach(async () => {
    await resetDb();
    const gymA = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymAId = gymA.id;
    const gymB = await prisma.gym.create({
      data: { name: 'Beta Gym', slug: 'beta-gym', status: GymStatus.ACTIVE },
    });
    gymBId = gymB.id;
  });

  afterAll(disconnect);

  it('numbers invoices sequentially per gym within a year', async () => {
    const first = await issue(charge(gymAId));
    const second = await issue(charge(gymAId));
    const third = await issue(charge(gymAId));

    expect([first.number, second.number, third.number]).toEqual([
      'INV-2026-1000',
      'INV-2026-1001',
      'INV-2026-1002',
    ]);
    expect([first.seq, second.seq, third.seq]).toEqual([1000, 1001, 1002]);
    expect(first.year).toBe(2026);
  });

  it('restarts the sequence at the gym’s starting number for a new fiscal year', async () => {
    const y2026 = await issue(charge(gymAId, { issuedAt: new Date('2026-12-31T23:00:00.000Z') }));
    const y2027 = await issue(charge(gymAId, { issuedAt: new Date('2027-01-01T00:00:00.000Z') }));

    expect(y2026.number).toBe('INV-2026-1000');
    expect(y2027.number).toBe('INV-2027-1000');
  });

  it('keeps each gym’s sequence independent (isolation)', async () => {
    const a1 = await issue(charge(gymAId));
    const b1 = await issue(charge(gymBId));
    const a2 = await issue(charge(gymAId));

    expect(a1.number).toBe('INV-2026-1000');
    expect(b1.number).toBe('INV-2026-1000');
    expect(a2.number).toBe('INV-2026-1001');
  });

  it('hands out distinct, gap-free numbers under concurrent charges for one gym-year', async () => {
    const count = 20;
    const results = await Promise.all(Array.from({ length: count }, () => issue(charge(gymAId))));

    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: count }, (_, i) => 1000 + i));

    // Every persisted number is unique — the DB's `@@unique([gymId, number])` would
    // reject a collision, so a full set proves the counter serialised correctly.
    const numbers = new Set(results.map((r) => r.number));
    expect(numbers.size).toBe(count);
    const stored = await prisma.invoice.count({ where: { gymId: gymAId } });
    expect(stored).toBe(count);
  });

  it('persists the charge details and defaults status to PAID', async () => {
    const issued = await issue(
      charge(gymAId, {
        amount: 12000,
        currency: 'GEL',
        description: 'Premium — monthly subscription',
      }),
    );

    const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: issued.id } });
    expect(stored).toMatchObject({
      gymId: gymAId,
      amount: 12000,
      currency: 'GEL',
      status: 'PAID',
      description: 'Premium — monthly subscription',
      number: 'INV-2026-1000',
      year: 2026,
      seq: 1000,
    });
  });

  /** Point a gym's Settings → Invoicing at a specific composition. */
  async function setInvoiceSettings(
    gymId: string,
    invoice: { prefix?: string; startNumber?: number; format?: string },
  ): Promise<void> {
    await prisma.gym.update({ where: { id: gymId }, data: { settings: { invoice } } });
  }

  it('composes the reference from the gym’s own prefix and shape', async () => {
    await setInvoiceSettings(gymAId, { prefix: 'FC', startNumber: 1, format: 'year-number' });

    const first = await issue(charge(gymAId));
    const second = await issue(charge(gymAId));

    // `year-number` prints no prefix, whatever the gym typed into the field.
    expect([first.number, second.number]).toEqual(['2026-0001', '2026-0002']);
  });

  // GREATEST, not a plain seed: a gym that raises its starting number mid-year sees
  // the change on its next invoice rather than next January, and the counter never
  // walks back over numbers it has already handed out.
  it('floors the running counter at a raised starting number, and ignores a lowered one', async () => {
    const first = await issue(charge(gymAId));
    expect(first.seq).toBe(1000);

    await setInvoiceSettings(gymAId, { startNumber: 5000 });
    const raised = await issue(charge(gymAId));
    expect(raised.number).toBe('INV-2026-5000');

    await setInvoiceSettings(gymAId, { startNumber: 10 });
    const lowered = await issue(charge(gymAId));
    expect(lowered.number).toBe('INV-2026-5001');
  });

  // `INV-1000` carries no year, so a per-year counter would hand the same reference
  // out again next January and violate `@@unique([gymId, number])`. That shape draws
  // from one continuous gym-wide bucket instead.
  it('keeps a year-less reference running across the fiscal-year boundary', async () => {
    await setInvoiceSettings(gymAId, { prefix: 'INV', startNumber: 1000, format: 'prefix-number' });

    const y2026 = await issue(charge(gymAId, { issuedAt: new Date('2026-12-31T23:00:00.000Z') }));
    const y2027 = await issue(charge(gymAId, { issuedAt: new Date('2027-01-01T00:00:00.000Z') }));

    expect([y2026.number, y2027.number]).toEqual(['INV-1000', 'INV-1001']);
    // The rows still record their true fiscal years even though the reference omits them.
    expect([y2026.year, y2027.year]).toEqual([2026, 2027]);
  });
});
