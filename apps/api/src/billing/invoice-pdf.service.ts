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
   * The gym's logo bytes (Settings → General), drawn above its name, or `null` when
   * the gym has none — in which case the header renders exactly as it did before.
   * PNG and JPEG only: see {@link drawableLogo}.
   */
  logo: Buffer | null;
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
/**
 * The largest area the logo may occupy in the header (points). Width is bounded so
 * the logo can never reach the right-hand "INVOICE" column; height so it cannot push
 * the invoice body down the page. A logo is only ever scaled *down* into this box,
 * never cropped and never stretched — see {@link scaleToFit}.
 */
const LOGO_MAX_WIDTH = 150;
const LOGO_MAX_HEIGHT = 60;
/** Gap between the logo and the gym name beneath it. */
const LOGO_GAP = 10;
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

    // Header — logo + gym name + contact (left) and the "INVOICE" wordmark + number
    // (right). The logo pushes the left column down; without one nothing moves.
    const logoOffset = this.drawLogo(doc, data.logo, left);
    const nameY = PAGE_MARGIN + logoOffset;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(data.gymName, left, nameY);
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
    let contactY = nameY + 26;
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

  /**
   * Draw the gym's logo at the top of the left column and report the vertical space
   * it consumed, or `0` when there is nothing drawable — the caller lays the rest of
   * the header out relative to that, so a gym without a logo gets the original page.
   *
   * The size drawn is derived from the image's own pixel dimensions, so the header
   * reserves exactly the height the logo actually occupies: a wide wordmark leaves no
   * dead space beneath it, and a square mark is not squeezed into a letterbox.
   *
   * A logo must never cost a member their invoice: an unsupported format is skipped
   * by {@link drawableLogo}, and a file that passes that check but still fails to
   * decode (a truncated or corrupt PNG) is caught here. Either way the document is
   * rendered without it.
   */
  private drawLogo(doc: PDFKit.PDFDocument, logo: Buffer | null, left: number): number {
    if (!drawableLogo(logo)) return 0;
    try {
      const intrinsic = intrinsicSize(logo);
      if (!intrinsic) {
        // Dimensions unreadable: let pdfkit fit it, and reserve the full box. The
        // logo may sit above a small gap, which beats overlapping the gym name.
        // No `align`/`valign` — the defaults are left/top, where the header wants it.
        doc.image(logo, left, PAGE_MARGIN, { fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT] });
        return LOGO_MAX_HEIGHT + LOGO_GAP;
      }

      const { width, height } = scaleToFit(intrinsic);
      doc.image(logo, left, PAGE_MARGIN, { width, height });
      return height + LOGO_GAP;
    } catch {
      return 0;
    }
  }
}

/** A bitmap's size in pixels. */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * The size (points) a logo of `intrinsic` pixels is drawn at: scaled down uniformly
 * until it fits inside {@link LOGO_MAX_WIDTH} × {@link LOGO_MAX_HEIGHT}, and left at
 * its natural size when it already does.
 *
 * Both axes share one scale factor, so the logo is never distorted, and because the
 * factor is the *smaller* of the two ratios the whole image always fits — nothing is
 * ever cropped. It is capped at 1 so a small logo is not blown up into a blurry one:
 * a 64px mark is drawn at 64pt rather than stretched to fill the box.
 */
export function scaleToFit(intrinsic: ImageSize): ImageSize {
  const { width, height } = intrinsic;
  if (width <= 0 || height <= 0) return { width: LOGO_MAX_WIDTH, height: LOGO_MAX_HEIGHT };

  const scale = Math.min(LOGO_MAX_WIDTH / width, LOGO_MAX_HEIGHT / height, 1);
  return { width: width * scale, height: height * scale };
}

/**
 * A PNG's or JPEG's pixel dimensions read straight from its header, or `null` when
 * they cannot be found. Done by hand rather than with an image library because these
 * are the only two formats that reach here and both state their size in the first few
 * bytes — pulling in a decoder to read four integers would be a poor trade.
 */
export function intrinsicSize(image: Buffer): ImageSize | null {
  // PNG: the IHDR chunk always comes first — width and height as big-endian u32.
  if (image.length >= 24 && image.toString('latin1', 12, 16) === 'IHDR') {
    return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
  }

  // JPEG: walk the marker segments to the start-of-frame, which carries the size.
  if (image.length >= 4 && image[0] === 0xff && image[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < image.length) {
      if (image[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = image[offset + 1]!;
      // SOF0–SOF15 hold the frame header; DHT/JPG/DAC share the range but do not.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: image.readUInt16BE(offset + 5), width: image.readUInt16BE(offset + 7) };
      }
      // Standalone markers (padding, RSTn) carry no length field.
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      offset += 2 + image.readUInt16BE(offset + 2);
    }
  }

  return null;
}

/**
 * True when the bytes are a PNG or JPEG — the only formats `pdfkit` can embed.
 * Checked by magic number rather than by the stored MIME type, because the logo is
 * read back from object storage where the recorded content type is whatever the
 * browser once claimed. The upload form is narrowed to these two formats, so this
 * only fires for logos uploaded before that narrowing.
 */
function drawableLogo(logo: Buffer | null): logo is Buffer {
  if (!logo || logo.length < 4) return false;
  const isPng = logo[0] === 0x89 && logo[1] === 0x50 && logo[2] === 0x4e && logo[3] === 0x47;
  const isJpeg = logo[0] === 0xff && logo[1] === 0xd8 && logo[2] === 0xff;
  return isPng || isJpeg;
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
