import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { InvoicePdfService, type InvoicePdfData } from './invoice-pdf.service';

/**
 * The visible text of a rendered PDF.
 *
 * pdfkit Flate-compresses its content streams, so the drawn strings never appear in
 * the raw bytes — asserting on `buffer.toString()` would silently pass no matter what
 * the page says. This inflates every `FlateDecode` stream and decodes the glyphs from
 * its text-showing operators, which is what a reader actually displays.
 *
 * pdfkit writes each run as a `[<hex> kern <hex> …] TJ` array (the kerning numbers
 * split one word across several chunks), so a run is reassembled by concatenating the
 * hex chunks of a single operator.
 */
function visibleText(pdf: Buffer): string {
  const runs: string[] = [];
  const raw = pdf.toString('latin1');
  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streams.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = pdf.indexOf('endstream', start, 'latin1');
    if (end < 0) continue;

    let content: string;
    try {
      content = inflateSync(pdf.subarray(start, end)).toString('latin1');
    } catch {
      // Not a Flate stream (an embedded font, say) — nothing readable here.
      continue;
    }

    for (const match of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const array = match[1] ?? '';
      const run = [...array.matchAll(/<([0-9a-fA-F]+)>/g)]
        .map((hexMatch) => Buffer.from(hexMatch[1] ?? '', 'hex').toString('latin1'))
        .join('');
      if (run) runs.push(run);
    }
    // Plain `(literal) Tj` form, in case a run is ever written that way.
    for (const match of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      if (match[1]) runs.push(match[1]);
    }
  }

  return runs.join('\n');
}

const BASE: InvoicePdfData = {
  number: '2026-0001',
  issuedAt: new Date('2026-07-04T10:00:00.000Z'),
  description: 'Premium — monthly renewal',
  amount: 4999,
  currency: 'GEL',
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

  it('draws the invoice’s own details', async () => {
    // Guards the assertion below: if this stops finding text, `visibleText` has gone
    // blind and the "no status" check would pass vacuously.
    const text = visibleText(await service.render(BASE));

    expect(text).toContain('INVOICE');
    expect(text).toContain('BILLED TO');
    expect(text).toContain('Nino Beridze');
    expect(text).toContain('Total');
    expect(text).toContain('49.99 GEL');
  });

  it('does not stamp a settlement state on the document', async () => {
    // The PDF is a member-facing keepsake: a "PENDING" printed on it would still be
    // there long after the invoice was settled.
    const text = visibleText(await service.render(BASE));

    expect(text).not.toContain('STATUS');
    for (const state of ['PAID', 'PENDING', 'FAILED', 'REFUNDED']) {
      expect(text).not.toContain(state);
    }
  });

  it('renders an empty description (uses the fallback line)', async () => {
    const buffer = await service.render({ ...BASE, description: '' });
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
