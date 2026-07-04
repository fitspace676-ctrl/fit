import { describe, expect, it } from 'vitest';
import { InvoiceStatus } from '@fit/db';
import { InvoicePdfService, type InvoicePdfData } from './invoice-pdf.service';

const BASE: InvoicePdfData = {
  number: '2026-0001',
  issuedAt: new Date('2026-07-04T10:00:00.000Z'),
  description: 'Premium — monthly renewal',
  amount: 4999,
  currency: 'GEL',
  status: InvoiceStatus.PAID,
  gymName: 'Iron Yard',
  memberName: 'Nino Beridze',
  memberEmail: 'nino@example.com',
};

describe('InvoicePdfService', () => {
  const service = new InvoicePdfService();

  it('renders a non-empty PDF document', async () => {
    const buffer = await service.render(BASE);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.byteLength).toBeGreaterThan(0);
    // A well-formed PDF starts with the `%PDF-` magic and ends with `%%EOF`.
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buffer.subarray(-6).toString('latin1')).toContain('%%EOF');
  });

  it('renders without a member name or email (falls back to a generic bill-to)', async () => {
    const buffer = await service.render({ ...BASE, memberName: null, memberEmail: null });

    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders every settlement state without throwing', async () => {
    for (const status of Object.values(InvoiceStatus)) {
      const buffer = await service.render({ ...BASE, status });
      expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    }
  });

  it('renders an empty description (uses the fallback line)', async () => {
    const buffer = await service.render({ ...BASE, description: '' });
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
