import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  /** Issuing gym's display name (the "Issued by" party). */
  gymName: string;
  /**
   * The gym's logo bytes (Settings → General), drawn at the top of the page, or
   * `null` when the gym has none — in which case the FormaCore wordmark takes its
   * place, so the header is never an empty corner. PNG and JPEG only: see
   * {@link drawableLogo}; anything else also falls back to the wordmark.
   */
  logo: Buffer | null;
  /**
   * The issuing gym's contact details (Settings → Business info), printed in the
   * "Issued by" tile under its name. Every field is nullable and an unset one is
   * simply not drawn.
   */
  gymContact: GymBusinessSettings;
  /** Billed member's name, when known. */
  memberName: string | null;
  /** Billed member's email, when known. */
  memberEmail: string | null;
}

/** Page geometry (A4, points). */
const PAGE_MARGIN = 48;
/**
 * The largest area the logo may occupy in the header (points). Width is bounded so
 * the logo can never reach the right-hand invoice column; height so it cannot push
 * the invoice body down the page. A logo is only ever scaled *down* into this box,
 * never cropped and never stretched — see {@link scaleToFit}.
 */
const LOGO_MAX_WIDTH = 150;
const LOGO_MAX_HEIGHT = 60;

/**
 * The palette — the console's LIGHT mode, lifted from `@fit/astryx-theme`'s
 * FormaCore "Lime Block" theme (`formacoreTheme.ts`): a warm charcoal ink ramp,
 * white paper, ink-50 inset tiles with an ink-200 hairline, and exactly one lime.
 * Text on the lime is always ink-950 — white on lime is unreadable.
 */
const INK = '#131312'; // ink-950 — primary text
const INK_SECONDARY = '#53534F'; // ink-600 — labels, secondary text
const INK_MUTED = '#8F8F8B'; // ink-400 — footer
const HAIRLINE = '#DCDCDA'; // ink-200 — dividers, tile borders
const TILE = '#F7F7F6'; // ink-50 — the inset tile
const LIME = '#E4F26A'; // brand-300 — the one block colour

/** The tile / block silhouette — the theme's "card" step of the radius ladder. */
const RADIUS = 14;
/** Inner padding of tiles and the total block. */
const PAD = 16;
/** Tracking (points) for the small uppercase labels. */
const LABEL_TRACKING = 1.2;

/**
 * The typefaces — the same system as the portal: Noto Sans Georgian for text
 * (one family for Georgian AND Latin, so a Georgian gym name and a Latin email sit
 * on the same skeleton) and JetBrains Mono for every numeral, which the direction
 * treats as the primary visual accent. Embedded rather than pdfkit's built-in
 * Helvetica, which has no Georgian glyphs at all — a member named ნინო would
 * otherwise get a row of empty boxes on their own invoice.
 */
const FONT_BODY = 'FC-Body';
const FONT_BOLD = 'FC-Bold';
const FONT_DISPLAY = 'FC-Display';
const FONT_MONO = 'FC-Mono';

/**
 * Bundled assets live outside `src/` so they are reached the same way whether the
 * API runs from `src/` (`node -r @swc-node/register`, as in production) or from the
 * compiled `dist/` — both sit one level below `apps/api`.
 */
const ASSETS_DIR = join(__dirname, '..', '..', 'assets', 'invoice');

/** The bundled files, read once per process — the same bytes serve every render. */
interface InvoiceAssets {
  body: Buffer;
  bold: Buffer;
  display: Buffer;
  mono: Buffer;
  /** The FormaCore wordmark, drawn when the gym has no usable logo of its own. */
  fallbackLogo: Buffer;
}

let assets: InvoiceAssets | null = null;

function loadAssets(): InvoiceAssets {
  if (!assets) {
    const font = (file: string) => readFileSync(join(ASSETS_DIR, 'fonts', file));
    assets = {
      body: font('NotoSansGeorgian-Regular.ttf'),
      bold: font('NotoSansGeorgian-Bold.ttf'),
      display: font('NotoSansGeorgian-ExtraBold.ttf'),
      mono: font('JetBrainsMono-Bold.ttf'),
      fallbackLogo: readFileSync(join(ASSETS_DIR, 'formacore-logo.png')),
    };
  }
  return assets;
}

/**
 * Renders an {@link Invoice} to a single-page A4 PDF (T5.10) with `pdfkit`, entirely
 * in memory. Deliberately dependency-light — no headless browser — because an invoice
 * is a fixed layout: a logo + invoice header, the two party tiles, one billed line and
 * the lime total block. The settlement state is deliberately absent — the document
 * records what is owed, not whether it has been paid, and a stale "PENDING" stamped
 * on a PDF the member keeps would outlive the payment. Stateless and pure: it takes a
 * flat {@link InvoicePdfData} snapshot and returns the bytes, so the caller owns
 * loading the invoice, storing the result in R2, and streaming it.
 */
@Injectable()
export class InvoicePdfService {
  /** Render `data` to PDF bytes. Resolves once the document is fully flushed. */
  render(data: InvoicePdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: { Title: `Invoice ${data.number}`, Author: data.gymName },
    });
    const chunks: Buffer[] = [];

    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    this.registerFonts(doc);
    this.compose(doc, data);
    doc.end();
    return done;
  }

  /** Register the bundled typefaces on this document under their role names. */
  private registerFonts(doc: PDFKit.PDFDocument): void {
    const files = loadAssets();
    doc.registerFont(FONT_BODY, files.body);
    doc.registerFont(FONT_BOLD, files.bold);
    doc.registerFont(FONT_DISPLAY, files.display);
    doc.registerFont(FONT_MONO, files.mono);
  }

  /** Lay out the document. Kept separate so {@link render} owns only the byte plumbing. */
  private compose(doc: PDFKit.PDFDocument, data: InvoicePdfData): void {
    const left = PAGE_MARGIN;
    const right = doc.page.width - PAGE_MARGIN;
    const width = right - left;

    // ── Header: the logo (left) and the invoice identity (right) ─────────────
    // The right column is fixed-height; the left one is however tall the logo is.
    const logoHeight = this.drawLogo(doc, data.logo, left);

    const headerColumnWidth = 220;
    const headerX = right - headerColumnWidth;
    label(doc, 'INVOICE', headerX, PAGE_MARGIN, { width: headerColumnWidth, align: 'right' });
    doc
      .fillColor(INK)
      .font(FONT_MONO)
      .fontSize(22)
      .text(data.number, headerX, PAGE_MARGIN + 12, {
        width: headerColumnWidth,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(INK_SECONDARY)
      .font(FONT_BODY)
      .fontSize(9.5)
      .text(`Issued ${formatDate(data.issuedAt)}`, headerX, PAGE_MARGIN + 42, {
        width: headerColumnWidth,
        align: 'right',
        lineBreak: false,
      });

    let y = Math.max(PAGE_MARGIN + logoHeight, PAGE_MARGIN + 56) + 24;
    hairline(doc, left, right, y);
    y += 24;

    // ── Parties: "Billed to" and "Issued by", two inset tiles side by side ───
    const gap = 12;
    const tileWidth = (width - gap) / 2;
    const billedTo: TileContent = {
      heading: 'BILLED TO',
      title: data.memberName ?? 'Member',
      lines: data.memberEmail ? [data.memberEmail] : [],
    };
    const issuedBy: TileContent = {
      heading: 'ISSUED BY',
      title: data.gymName,
      lines: issuerLines(data.gymContact),
    };
    const tileHeight = Math.max(tileContentHeight(billedTo), tileContentHeight(issuedBy));
    drawTile(doc, billedTo, left, y, tileWidth, tileHeight);
    drawTile(doc, issuedBy, left + tileWidth + gap, y, tileWidth, tileHeight);
    y += tileHeight + 32;

    // ── Line items ───────────────────────────────────────────────────────────
    const amountWidth = 140;
    const amountX = right - amountWidth;
    const descriptionWidth = amountX - left - 24;
    label(doc, 'DESCRIPTION', left, y);
    label(doc, 'AMOUNT', amountX, y, { width: amountWidth, align: 'right' });
    y += 14;
    hairline(doc, left, right, y);
    y += 14;

    const description = data.description || 'Membership charge';
    const money = formatMoney(data.amount, data.currency);
    doc.fillColor(INK).font(FONT_BODY).fontSize(11);
    const descriptionHeight = doc.heightOfString(description, { width: descriptionWidth });
    doc.text(description, left, y, { width: descriptionWidth });
    doc
      .font(FONT_MONO)
      .fontSize(11)
      .text(money, amountX, y + 1, { width: amountWidth, align: 'right', lineBreak: false });
    y += Math.max(descriptionHeight, 14) + 14;
    hairline(doc, left, right, y);
    y += 24;

    // ── Total: the lime block, the page's one colour ─────────────────────────
    // The theme's signature — a solid lime block carrying a giant mono numeral —
    // and the only thing on the page a reader must not miss.
    const blockWidth = 240;
    const blockHeight = 84;
    const blockX = right - blockWidth;
    doc.roundedRect(blockX, y, blockWidth, blockHeight, RADIUS).fill(LIME);
    label(doc, 'TOTAL', blockX + PAD, y + PAD, { color: INK });

    const digits = formatAmount(data.amount);
    doc.font(FONT_MONO).fontSize(30);
    const digitsWidth = doc.widthOfString(digits);
    doc.font(FONT_BOLD).fontSize(10);
    const currencyWidth = doc.widthOfString(data.currency, { characterSpacing: LABEL_TRACKING });
    const amountRight = blockX + blockWidth - PAD;
    const amountY = y + PAD + 18;
    doc
      .fillColor(INK)
      .font(FONT_MONO)
      .fontSize(30)
      .text(digits, amountRight - digitsWidth - currencyWidth - 8, amountY, { lineBreak: false });
    doc
      .font(FONT_BOLD)
      .fontSize(10)
      .text(data.currency, amountRight - currencyWidth, amountY + 19, {
        characterSpacing: LABEL_TRACKING,
        lineBreak: false,
      });

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = doc.page.height - PAGE_MARGIN - 20;
    hairline(doc, left, right, footerY - 12);
    doc
      .fillColor(INK_MUTED)
      .font(FONT_BODY)
      .fontSize(8.5)
      .text(`${data.gymName} · Invoice ${data.number}`, left, footerY, {
        width: width / 2,
        lineBreak: false,
      })
      .text(formatDate(data.issuedAt), left + width / 2, footerY, {
        width: width / 2,
        align: 'right',
        lineBreak: false,
      });
  }

  /**
   * Draw the gym's logo at the top of the left column and report the vertical space
   * it consumed; the rest of the header is laid out relative to that.
   *
   * The size drawn is derived from the image's own pixel dimensions, so the header
   * reserves exactly the height the logo actually occupies: a wide wordmark leaves no
   * dead space beneath it, and a square mark is not squeezed into a letterbox.
   *
   * A logo must never cost a member their invoice, and the corner must never be
   * empty: a gym with no logo, one in a format `pdfkit` cannot embed (skipped by
   * {@link drawableLogo}), or one that passes that check but still fails to decode
   * (a truncated or corrupt PNG, caught here) all get the FormaCore wordmark
   * instead. Should even that fail, the document is rendered without a logo.
   */
  private drawLogo(doc: PDFKit.PDFDocument, logo: Buffer | null, left: number): number {
    if (drawableLogo(logo)) {
      try {
        return placeLogo(doc, logo, left);
      } catch {
        // Fall through to the wordmark.
      }
    }
    try {
      return placeLogo(doc, loadAssets().fallbackLogo, left);
    } catch {
      return 0;
    }
  }
}

/** Draw `logo` scaled into the header box and return the height it occupies. */
function placeLogo(doc: PDFKit.PDFDocument, logo: Buffer, left: number): number {
  const intrinsic = intrinsicSize(logo);
  if (!intrinsic) {
    // Dimensions unreadable: let pdfkit fit it, and reserve the full box. The
    // logo may sit above a small gap, which beats overlapping the header.
    // No `align`/`valign` — the defaults are left/top, where the header wants it.
    doc.image(logo, left, PAGE_MARGIN, { fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT] });
    return LOGO_MAX_HEIGHT;
  }
  const { width, height } = scaleToFit(intrinsic);
  doc.image(logo, left, PAGE_MARGIN, { width, height });
  return height;
}

/** What one party tile shows: a tracked heading, a bold title, then quiet lines. */
interface TileContent {
  heading: string;
  title: string;
  lines: string[];
}

const TILE_HEADING_HEIGHT = 18;
const TILE_TITLE_HEIGHT = 18;
const TILE_LINE_HEIGHT = 13;

/** The height a tile needs for its content, so two tiles can share the taller one. */
function tileContentHeight(content: TileContent): number {
  return (
    PAD * 2 + TILE_HEADING_HEIGHT + TILE_TITLE_HEIGHT + content.lines.length * TILE_LINE_HEIGHT
  );
}

/**
 * An inset tile — the theme's light-mode "recessed" surface: ink-50 inside white,
 * with a hairline. Reads as a panel without a shadow.
 */
function drawTile(
  doc: PDFKit.PDFDocument,
  content: TileContent,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  doc.roundedRect(x, y, width, height, RADIUS).lineWidth(1).fillAndStroke(TILE, HAIRLINE);

  const innerX = x + PAD;
  const innerWidth = width - PAD * 2;
  let cursor = y + PAD;
  label(doc, content.heading, innerX, cursor);
  cursor += TILE_HEADING_HEIGHT;
  doc
    .fillColor(INK)
    .font(FONT_BOLD)
    .fontSize(12)
    .text(content.title, innerX, cursor, { width: innerWidth, lineBreak: false });
  cursor += TILE_TITLE_HEIGHT;
  doc.fillColor(INK_SECONDARY).font(FONT_BODY).fontSize(9.5);
  for (const line of content.lines) {
    doc.text(line, innerX, cursor, { width: innerWidth, lineBreak: false });
    cursor += TILE_LINE_HEIGHT;
  }
}

/** A small, tracked, uppercase label — the theme's section heading. */
function label(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  options: { width?: number; align?: 'left' | 'right'; color?: string } = {},
): void {
  doc
    .fillColor(options.color ?? INK_SECONDARY)
    .font(FONT_BOLD)
    .fontSize(7.5)
    .text(text, x, y, {
      characterSpacing: LABEL_TRACKING,
      lineBreak: false,
      ...(options.width !== undefined ? { width: options.width } : {}),
      ...(options.align ? { align: options.align } : {}),
    });
}

/** A one-point ink-200 rule across the content width. */
function hairline(doc: PDFKit.PDFDocument, left: number, right: number, y: number): void {
  doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(HAIRLINE).stroke();
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

/** Minor units → `"12.00"`. Two decimals for the standard 100-minor currencies. */
function formatAmount(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2);
}

/** Minor units → `"12.00 GEL"`. */
function formatMoney(minorUnits: number, currency: string): string {
  return `${formatAmount(minorUnits)} ${currency}`;
}

/** `"4 Jul 2026"` in a fixed, locale-independent form (the document is not localised). */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
