import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { StorageService } from '../storage/storage.service';
import { InvoiceDocumentService, invoiceObjectKey } from './invoice-document.service';
import type { InvoicePdfService } from './invoice-pdf.service';

/** A stored invoice row, as the PDF-select projection returns it. */
function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    gymId: 'gym-1',
    number: '2026-0001',
    year: 2026,
    issuedAt: new Date('2026-07-04T10:00:00.000Z'),
    description: 'Premium — monthly renewal',
    amount: 4999,
    currency: 'GEL',
    pdfUrl: null,
    gym: { name: 'Iron Yard' },
    member: { user: { name: 'Nino Beridze', email: 'nino@example.com' } },
    ...overrides,
  };
}

function setup(opts: { configured?: boolean } = {}) {
  const findFirst = vi.fn<(args: unknown) => Promise<unknown>>();
  const update = vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({});
  const prisma = {
    client: { invoice: { findFirst, update } },
  } as unknown as TenantPrismaService;

  const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-rendered'));
  const pdf = { render } as unknown as InvoicePdfService;

  const getObject = vi.fn<(key: string) => Promise<Buffer | null>>();
  const putObject = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const storage = {
    isConfigured: opts.configured ?? true,
    getObject,
    putObject,
  } as unknown as StorageService;

  return {
    service: new InvoiceDocumentService(prisma, pdf, storage),
    findFirst,
    update,
    render,
    getObject,
    putObject,
  };
}

describe('InvoiceDocumentService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when the invoice is not visible to the caller', async () => {
    const { service, findFirst, render } = setup();
    findFirst.mockResolvedValue(null);

    await expect(service.getPdf('missing')).resolves.toBeNull();
    expect(render).not.toHaveBeenCalled();
  });

  it('constrains the lookup to the member under a member scope', async () => {
    const { service, findFirst } = setup();
    findFirst.mockResolvedValue(null);

    await service.getPdf('inv-1', { memberId: 'gm-9' });

    expect((findFirst.mock.calls[0]?.[0] as { where: unknown }).where).toMatchObject({
      id: 'inv-1',
      memberId: 'gm-9',
    });
  });

  it('does not filter by member without a member scope (admin path)', async () => {
    const { service, findFirst } = setup();
    findFirst.mockResolvedValue(null);

    await service.getPdf('inv-1');

    const where = (findFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ id: 'inv-1' });
    expect(where.memberId).toBeUndefined();
  });

  it('renders, caches to R2, and persists the key on first access', async () => {
    const { service, findFirst, render, putObject, update } = setup({ configured: true });
    findFirst.mockResolvedValue(invoiceRow({ pdfUrl: null }));

    const result = await service.getPdf('inv-1');

    expect(render).toHaveBeenCalledOnce();
    expect(result?.number).toBe('2026-0001');
    expect(result?.buffer.toString('latin1')).toBe('%PDF-rendered');

    const key = invoiceObjectKey('gym-1', 2026, '2026-0001');
    expect(putObject).toHaveBeenCalledWith(key, expect.any(Buffer), 'application/pdf');
    expect(update).toHaveBeenCalledWith({ where: { id: 'inv-1' }, data: { pdfUrl: key } });
  });

  it('serves the cached copy from R2 without re-rendering', async () => {
    const { service, findFirst, render, getObject, putObject } = setup({ configured: true });
    findFirst.mockResolvedValue(invoiceRow({ pdfUrl: 'gym-1/invoices/2026/2026-0001.pdf' }));
    getObject.mockResolvedValue(Buffer.from('%PDF-cached'));

    const result = await service.getPdf('inv-1');

    expect(getObject).toHaveBeenCalledWith('gym-1/invoices/2026/2026-0001.pdf');
    expect(render).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(result?.buffer.toString('latin1')).toBe('%PDF-cached');
  });

  it('re-renders when the cached object has gone missing', async () => {
    const { service, findFirst, render, getObject } = setup({ configured: true });
    findFirst.mockResolvedValue(invoiceRow({ pdfUrl: 'gym-1/invoices/2026/2026-0001.pdf' }));
    getObject.mockResolvedValue(null);

    const result = await service.getPdf('inv-1');

    expect(render).toHaveBeenCalledOnce();
    expect(result?.buffer.toString('latin1')).toBe('%PDF-rendered');
  });

  it('renders on the fly and skips storage when R2 is not configured', async () => {
    const { service, findFirst, render, getObject, putObject, update } = setup({
      configured: false,
    });
    findFirst.mockResolvedValue(invoiceRow({ pdfUrl: null }));

    const result = await service.getPdf('inv-1');

    expect(render).toHaveBeenCalledOnce();
    expect(getObject).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(result?.buffer.toString('latin1')).toBe('%PDF-rendered');
  });

  it('still returns the rendered bytes when the R2 write fails (best-effort cache)', async () => {
    const { service, findFirst, putObject, update } = setup({ configured: true });
    findFirst.mockResolvedValue(invoiceRow({ pdfUrl: null }));
    putObject.mockRejectedValue(new Error('R2 down'));

    const result = await service.getPdf('inv-1');

    expect(result?.buffer.toString('latin1')).toBe('%PDF-rendered');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('invoiceObjectKey', () => {
  it('namespaces the PDF under the gym, year, and invoice number', () => {
    expect(invoiceObjectKey('gym-1', 2026, '2026-0007')).toBe('gym-1/invoices/2026/2026-0007.pdf');
  });
});
