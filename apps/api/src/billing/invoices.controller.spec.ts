import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import type { InvoiceDocumentService } from './invoice-document.service';
import { InvoicesController } from './invoices.controller';

function resMock() {
  const headers: Record<string, string> = {};
  const end = vi.fn();
  const res = {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    end,
  } as unknown as Response;
  return { res, headers, end };
}

describe('InvoicesController', () => {
  it('streams the PDF as an attachment named after the invoice number', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const getPdf = vi.fn().mockResolvedValue({ buffer, number: '2026-0009' });
    const controller = new InvoicesController({ getPdf } as unknown as InvoiceDocumentService);
    const { res, headers, end } = resMock();

    await controller.pdf('inv-1', res);

    expect(getPdf).toHaveBeenCalledWith('inv-1');
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toBe('attachment; filename="invoice-2026-0009.pdf"');
    expect(headers['Content-Length']).toBe(String(buffer.byteLength));
    expect(end).toHaveBeenCalledWith(buffer);
  });

  it('404s an unknown / cross-tenant invoice without writing a body', async () => {
    const getPdf = vi.fn().mockResolvedValue(null);
    const controller = new InvoicesController({ getPdf } as unknown as InvoiceDocumentService);
    const { res, end } = resMock();

    await expect(controller.pdf('missing', res)).rejects.toBeInstanceOf(NotFoundException);
    expect(end).not.toHaveBeenCalled();
  });
});
