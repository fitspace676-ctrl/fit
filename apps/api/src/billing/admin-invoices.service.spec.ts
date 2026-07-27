import { describe, expect, it, vi } from 'vitest';
import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ListAdminInvoicesQuery } from '@fit/types';
import { AdminInvoicesService } from './admin-invoices.service';
import type { InvoiceDocumentService } from './invoice-document.service';
import type { InvoiceService } from './invoice.service';
import type { MailerService } from '../mail/mailer.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

const GYM_ID = 'gym-1';

/** A selected invoice row as the service's `select` shapes it. */
function invoiceRecord(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    number: '2026-0001',
    memberId: 'mem-1',
    type: 'SERVICE',
    description: 'Locker hire',
    amount: 5000,
    currency: 'GEL',
    issuedAt: new Date('2026-07-26T00:00:00.000Z'),
    dueDate: new Date('2026-08-31T00:00:00.000Z'),
    member: { user: { name: 'Nino B', email: 'nino@example.com' } },
    ...over,
  };
}

/** Assemble the service over stubbed collaborators; each test overrides what it needs. */
function build(
  over: {
    invoice?: Record<string, unknown>;
    gymMember?: Record<string, unknown>;
    issue?: ReturnType<typeof vi.fn>;
    getPdf?: ReturnType<typeof vi.fn>;
    send?: ReturnType<typeof vi.fn>;
    mailConfigured?: boolean;
  } = {},
) {
  const invoice = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findFirst: vi.fn().mockResolvedValue(invoiceRecord()),
    ...over.invoice,
  };
  const gymMember = {
    findFirst: vi.fn().mockResolvedValue({ id: 'mem-1' }),
    ...over.gymMember,
  };
  const client = {
    invoice,
    gymMember,
    // Run the callback against the same stub client, mirroring how the real
    // interactive transaction hands its caller a client.
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => Promise.resolve(fn(client))),
  };
  const issue = over.issue ?? vi.fn().mockResolvedValue({ id: 'inv-1', number: '2026-0001' });
  const getPdf =
    over.getPdf ?? vi.fn().mockResolvedValue({ buffer: Buffer.from('%PDF'), number: '2026-0001' });
  const send = over.send ?? vi.fn().mockResolvedValue({ sent: true, id: 'msg-1' });

  const service = new AdminInvoicesService(
    { client } as unknown as TenantPrismaService,
    { gymId: GYM_ID } as unknown as TenantContext,
    { issue } as unknown as InvoiceService,
    { getPdf } as unknown as InvoiceDocumentService,
    { send, isConfigured: over.mailConfigured ?? true } as unknown as MailerService,
  );
  return { service, invoice, gymMember, issue, getPdf, send, client };
}

/** A parsed roster query with the schema's defaults filled in. */
function query(over: Partial<ListAdminInvoicesQuery> = {}): ListAdminInvoicesQuery {
  return { page: 1, limit: 20, sort: 'issuedAt', dir: 'desc', ...over };
}

describe('AdminInvoicesService.listInvoices', () => {
  it('denormalises the billed member onto each row', async () => {
    const { service, invoice } = build({
      invoice: {
        findMany: vi.fn().mockResolvedValue([invoiceRecord()]),
        count: vi.fn().mockResolvedValue(1),
      },
    });

    const result = await service.listInvoices(query());

    expect(result).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(result.data[0]).toMatchObject({
      number: '2026-0001',
      memberName: 'Nino B',
      memberEmail: 'nino@example.com',
      issuedAt: '2026-07-26T00:00:00.000Z',
      dueDate: '2026-08-31T00:00:00.000Z',
    });
    expect(invoice.findMany).toHaveBeenCalled();
  });

  it('reports a deleted member as null rather than dropping the invoice', async () => {
    const { service } = build({
      invoice: {
        findMany: vi.fn().mockResolvedValue([invoiceRecord({ memberId: null, member: null })]),
        count: vi.fn().mockResolvedValue(1),
      },
    });

    const [row] = (await service.listInvoices(query())).data;

    expect(row).toMatchObject({ memberId: null, memberName: null, memberEmail: null });
  });

  it('makes the issuedTo filter inclusive of the whole day', async () => {
    const { service, invoice } = build();

    await service.listInvoices(query({ issuedFrom: '2026-07-01', issuedTo: '2026-07-31' }));

    const where = (
      invoice.findMany.mock.calls[0]![0] as { where: { issuedAt: { gte: Date; lt: Date } } }
    ).where;
    expect(where.issuedAt.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    // Exclusive next midnight, so an invoice raised at 23:59 on the 31st still matches.
    expect(where.issuedAt.lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
  });

  it('searches the number, the description and the member name', async () => {
    const { service, invoice } = build();

    await service.listInvoices(query({ search: 'nino' }));

    const where = (invoice.findMany.mock.calls[0]![0] as { where: { OR?: unknown[] } }).where;
    expect(where.OR).toHaveLength(3);
  });

  it('pins null due dates last so the ones actually falling due lead', async () => {
    const { service, invoice } = build();

    await service.listInvoices(query({ sort: 'dueDate', dir: 'asc' }));

    const orderBy = (invoice.findMany.mock.calls[0]![0] as { orderBy: unknown[] }).orderBy;
    expect(orderBy[0]).toEqual({ dueDate: { sort: 'asc', nulls: 'last' } });
  });

  it('applies the same where to the page and the count, so the pager is accurate', async () => {
    const { service, invoice } = build();

    await service.listInvoices(query({ type: 'SERVICE' }));

    const listWhere = (invoice.findMany.mock.calls[0]![0] as { where: unknown }).where;
    const countWhere = (invoice.count.mock.calls[0]![0] as { where: unknown }).where;
    expect(countWhere).toEqual(listWhere);
  });
});

describe('AdminInvoicesService.createInvoice', () => {
  const body = {
    memberId: 'mem-1',
    type: 'SERVICE' as const,
    description: 'Locker hire',
    amount: 5000,
    currency: 'GEL',
    dueDate: '2026-08-31',
  };

  it('mints through InvoiceService inside a transaction, with no subscription or order', async () => {
    const { service, issue, client } = build();

    await service.createInvoice(body);

    expect(client.$transaction).toHaveBeenCalled();
    const input = issue.mock.calls[0]![1] as Record<string, unknown>;
    expect(input).toMatchObject({
      gymId: GYM_ID,
      memberId: 'mem-1',
      amount: 5000,
      currency: 'GEL',
      status: 'PENDING',
      type: 'SERVICE',
    });
    expect(input.subscriptionId).toBeUndefined();
    expect(input.orderId).toBeUndefined();
    expect((input.dueDate as Date).toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('carries a null due date when the invoice states no deadline', async () => {
    const { service, issue } = build();

    await service.createInvoice({ ...body, dueDate: undefined });

    expect((issue.mock.calls[0]![1] as { dueDate: unknown }).dueDate).toBeNull();
  });

  it('always starts PENDING — raising an invoice is asking to be paid', async () => {
    const { service, issue } = build();

    await service.createInvoice(body);

    expect((issue.mock.calls[0]![1] as { status: unknown }).status).toBe('PENDING');
  });

  it('404s an unknown or cross-tenant member without minting anything', async () => {
    const { service, issue } = build({ gymMember: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(service.createInvoice(body)).rejects.toBeInstanceOf(NotFoundException);
    expect(issue).not.toHaveBeenCalled();
  });
});

describe('AdminInvoicesService.emailInvoice', () => {
  it('sends the rendered PDF as an attachment named after the invoice', async () => {
    const { service, send, getPdf } = build({
      invoice: {
        findFirst: vi.fn().mockResolvedValue({ ...invoiceRecord(), gym: { name: 'Downtown' } }),
      },
    });

    const result = await service.emailInvoice('inv-1');

    expect(result).toEqual({ sent: true, to: 'nino@example.com' });
    expect(getPdf).toHaveBeenCalledWith('inv-1');
    const message = send.mock.calls[0]![0] as {
      to: string;
      subject: string;
      attachments: { filename: string; content: Buffer }[];
    };
    expect(message.to).toBe('nino@example.com');
    expect(message.subject).toBe('Invoice 2026-0001 from Downtown');
    expect(message.attachments[0]!.filename).toBe('invoice-2026-0001.pdf');
    expect(message.attachments[0]!.content).toBeInstanceOf(Buffer);
  });

  it('404s an unknown or cross-tenant invoice', async () => {
    const { service, send } = build({ invoice: { findFirst: vi.fn().mockResolvedValue(null) } });

    await expect(service.emailInvoice('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(send).not.toHaveBeenCalled();
  });

  it('422s when the invoice has no member to send to', async () => {
    const { service, send } = build({
      invoice: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ ...invoiceRecord({ member: null }), gym: { name: 'Downtown' } }),
      },
    });

    await expect(service.emailInvoice('inv-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('422s when the member has no email address', async () => {
    const { service } = build({
      invoice: {
        findFirst: vi.fn().mockResolvedValue({
          ...invoiceRecord({ member: { user: { name: 'Nino B', email: null } } }),
          gym: { name: 'Downtown' },
        }),
      },
    });

    await expect(service.emailInvoice('inv-1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('503s when mail is unconfigured, without rendering a PDF it cannot send', async () => {
    const { service, getPdf, send } = build({
      mailConfigured: false,
      invoice: {
        findFirst: vi.fn().mockResolvedValue({ ...invoiceRecord(), gym: { name: 'Downtown' } }),
      },
    });

    await expect(service.emailInvoice('inv-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getPdf).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
