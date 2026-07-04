import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { MeInvoicesController } from './me-invoices.controller';
import type { MeInvoicesService } from './me-invoices.service';

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

describe('MeInvoicesController', () => {
  it('streams the caller invoice PDF as an attachment', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const getInvoicePdf = vi.fn().mockResolvedValue({ buffer, number: '2026-0001' });
    const controller = new MeInvoicesController({
      getInvoicePdf,
    } as unknown as MeInvoicesService);
    const { res, headers, end } = resMock();

    await controller.pdf('inv-1', res);

    expect(getInvoicePdf).toHaveBeenCalledWith('inv-1');
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toBe('attachment; filename="invoice-2026-0001.pdf"');
    expect(end).toHaveBeenCalledWith(buffer);
  });

  it("404s when the invoice is not the caller's / does not exist", async () => {
    const getInvoicePdf = vi.fn().mockResolvedValue(null);
    const controller = new MeInvoicesController({
      getInvoicePdf,
    } as unknown as MeInvoicesService);
    const { res, end } = resMock();

    await expect(controller.pdf('missing', res)).rejects.toBeInstanceOf(NotFoundException);
    expect(end).not.toHaveBeenCalled();
  });
});
