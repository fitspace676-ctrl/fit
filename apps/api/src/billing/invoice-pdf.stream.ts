import type { Response } from 'express';
import type { InvoicePdfResult } from './invoice-document.service';

/**
 * Write a rendered invoice PDF to the Express response as a downloadable attachment.
 * Shared by the admin (`/invoices/:id/pdf`) and member (`/me/invoices/:id/pdf`)
 * download routes so the headers — content type, filename, no-store — stay identical.
 */
export function streamInvoicePdf(res: Response, result: InvoicePdfResult): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${result.number}.pdf"`);
  res.setHeader('Content-Length', String(result.buffer.byteLength));
  res.setHeader('Cache-Control', 'no-store');
  res.end(result.buffer);
}
