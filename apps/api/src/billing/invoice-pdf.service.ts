import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { GymBusinessSettings } from '@fit/types';

/** Everything the invoice document renders — a flat snapshot, no DB access here. */
export interface InvoicePdfData {
  /** Per-gym, per-year sequential reference (e.g. `"2026-0001"`). */
  number: string;
  /** When the invoice was raised. */
  issuedAt: Date;
  /** Human-readable line describing what was billed. */
  description: string;
  /** Charged amount in the currency's MINOR units (cents/tetri). */
  amount: number;
  /** ISO-4217 currency, snapshotted from the charge. */
  currency: string;
  /** Issuing gym's display name (the document header). */
  gymName: string;
  /**
   * The issuing gym's contact details (Settings → Business info), printed under
   * its name. Every field is nullable and an unset one is simply not drawn — an
   * invoice from a gym that has filled in nothing looks exactly as it did before.
   */
  gymContact: GymBusinessSettings;
  /** Billed member's name, when known. */
  memberName: string | null;
  /** Billed member's email, when known. */
  memberEmail: string | null;
}

/** Page geometry (A4, points). */
const PAGE_MARGIN = 50;
const BRAND = '#7C3AED';
const INK = '#1A1A2E';
const MUTED = '#6B7280';

/**
 * Renders an {@link Invoice} to a single-page A4 PDF (T5.10) with `pdfkit`, entirely
 * in memory. Deliberately dependency-light — no headless browser — because an invoice
 * is a fixed, text-only layout: a gym header, the invoice/bill-to block, one billed
 * line and the total. The settlement state is deliberately absent — the document
 * records what is owed, not whether it has been paid, and a stale "PENDING" stamped
 * on a PDF the member keeps would outlive the payment. Stateless and pure: it takes a flat
 * {@link InvoicePdfData} snapshot and returns the bytes, so the caller owns loading the
 * invoice, storing the result in R2, and streaming it.
 */
@Injectable()
export class InvoicePdfService {
  /** Render `data` to PDF bytes. Resolves once the document is fully flushed. */
  render(data: InvoicePdfData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.compose(doc, data);
    doc.end();
    return done;
  }

  /** Lay out the document. Kept separate so {@link render} owns only the byte plumbing. */
  private compose(doc: PDFKit.PDFDocument, data: InvoicePdfData): void {
    const left = PAGE_MARGIN;
    const right = doc.page.width - PAGE_MARGIN;
    const money = formatMoney(data.amount, data.currency);

    // Header — gym name + contact (left) and the "INVOICE" wordmark + number (right).
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(data.gymName, left, PAGE_MARGIN);
    doc
      .fillColor(BRAND)
      .font('Helvetica-Bold')
      .fontSize(24)
      .text('INVOICE', left, PAGE_MARGIN, { align: 'right' });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(`No. ${data.number}`, left, PAGE_MARGIN + 30, { align: 'right' })
      .text(`Issued ${formatDate(data.issuedAt)}`, { align: 'right' });

    // Issuer contact, one line per filled-in field, under the gym name. The
    // right-hand column runs to ~PAGE_MARGIN + 56, so the lines are width-capped
    // to the left half and the divider is pushed below whichever column is taller.
    const contactLines = issuerLines(data.gymContact);
    let contactY = PAGE_MARGIN + 26;
    for (const line of contactLines) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text(line, left, contactY, { width: (right - left) / 2 - 12, lineBreak: false });
      contactY += 11;
    }

    // Divider under the header, clear of both columns.
    const dividerY = Math.max(PAGE_MARGIN + 64, contactY + 4);
    doc.moveTo(left, dividerY).lineTo(right, dividerY).strokeColor('#E5E7EB').lineWidth(1).stroke();

    // Bill-to block.
    let y = dividerY + 20;
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(9).text('BILLED TO', left, y);
    y += 14;
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(11)
      .text(data.memberName ?? 'Member', left, y);
    if (data.memberEmail) {
      y += 15;
      doc.fillColor(MUTED).fontSize(10).text(data.memberEmail, left, y);
    }

    // Line-item table.
    y += 44;
    const amountX = right - 120;
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('DESCRIPTION', left, y)
      .text('AMOUNT', amountX, y, { width: 120, align: 'right' });
    y += 12;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 12;
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(11)
      .text(data.description || 'Membership charge', left, y, { width: amountX - left - 12 })
      .text(money, amountX, y, { width: 120, align: 'right' });

    // Total row.
    y += 36;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    y += 14;
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('Total', left, y)
      .text(money, amountX, y, { width: 120, align: 'right' });

    // Footer.
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(`${data.gymName} · Invoice ${data.number}`, left, doc.page.height - PAGE_MARGIN - 12, {
        width: right - left,
        align: 'center',
      });
  }
}

/**
 * The issuer's contact block, one line per filled-in field, in the order a reader
 * scans an invoice header: where the gym is, how to call it, how to write to it,
 * where to find it. An empty settings block yields no lines at all.
 */
function issuerLines(contact: GymBusinessSettings): string[] {
  return [contact.address, contact.phone, contact.email, contact.website]
    .map((value) => value?.trim() ?? '')
    .filter((value) => value.length > 0);
}

/** Minor units → `"12.00 GEL"`. Two decimals for the standard 100-minor currencies. */
function formatMoney(minorUnits: number, currency: string): string {
  return `${(minorUnits / 100).toFixed(2)} ${currency}`;
}

/** `"4 Jul 2026"` in a fixed, locale-independent form (the document is not localised). */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
