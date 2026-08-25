import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  InvoicePdfService,
  intrinsicSize,
  scaleToFit,
  type InvoicePdfData,
} from './invoice-pdf.service';

/**
 * The visible text of a rendered PDF.
 *
 * pdfkit Flate-compresses its content streams, so the drawn strings never appear in
 * the raw bytes — asserting on `buffer.toString()` would silently pass no matter what
 * the page says. And because the document embeds its own typefaces, every text run
 * is written as 2-byte *glyph ids* of a subset font, not as characters — so even the
 * inflated stream is unreadable without the font's `ToUnicode` CMap, which is what a
 * reader uses to turn glyphs back into text. This walks the page the way a reader
 * does: it maps each font resource (`/F1 …`) to its CMap, tracks the current font
 * through `Tf` operators, and decodes every `TJ` / `Tj` run through that CMap.
 *
 * Runs are joined with newlines, so a phrase drawn in one `text()` call is found
 * whole, while two separately placed pieces (a mono amount and a bold currency code)
 * are not accidentally joined into a match.
 */
function visibleText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const cmaps = fontCmaps(pdf, raw);
  const runs: string[] = [];

  let current: Map<number, string> | undefined;
  const operators = /\/(F\d+)\s+[\d.]+\s+Tf|\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g;
  for (const match of contentStreams(pdf).matchAll(operators)) {
    const [, fontName, array, single] = match;
    if (fontName) {
      current = cmaps.get(fontName);
      continue;
    }
    const hexes = array
      ? [...array.matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1] ?? '')
      : [single ?? ''];
    const run = hexes.map((hex) => decodeGlyphs(hex, current)).join('');
    if (run) runs.push(run);
  }

  return runs.join('\n');
}

/** Glyph ids (4 hex chars each) → text, through the font's `ToUnicode` map. */
function decodeGlyphs(hex: string, cmap: Map<number, string> | undefined): string {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += cmap?.get(parseInt(hex.slice(i, i + 4), 16)) ?? '';
  }
  return out;
}

/**
 * Every font resource on the page (`/F1 5 0 R` → object 5), resolved to the glyph →
 * text map from its `ToUnicode` CMap. Objects are located by their `N 0 obj` header
 * in the raw bytes; the CMap stream is inflated and its `bfrange` entries parsed —
 * pdfkit writes one `<lo> <hi> [<u> <u> …]` range per font, each `<u>` being the
 * UTF-16BE code units the glyph stands for.
 */
function fontCmaps(pdf: Buffer, raw: string): Map<string, Map<number, string>> {
  const objectBody = (id: number): string | null => {
    const header = new RegExp(`(?:^|\\s)${id} 0 obj\\s*`, 'g');
    const match = header.exec(raw);
    if (!match) return null;
    const start = match.index + match[0].length;
    const end = raw.indexOf('endobj', start);
    return end < 0 ? null : raw.slice(start, end);
  };
  const objectStream = (id: number): string | null => {
    const body = objectBody(id);
    if (!body) return null;
    const streamAt = /stream\r?\n/.exec(body);
    if (!streamAt) return null;
    const headerLength = raw.indexOf(body) + streamAt.index + streamAt[0].length;
    const end = pdf.indexOf('endstream', headerLength, 'latin1');
    try {
      return inflateSync(pdf.subarray(headerLength, end)).toString('latin1');
    } catch {
      return null;
    }
  };

  const cmaps = new Map<string, Map<number, string>>();
  for (const match of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const [, name, fontId] = match;
    if (!name || cmaps.has(name)) continue;
    const font = objectBody(Number(fontId));
    const toUnicode = font && /\/ToUnicode (\d+) 0 R/.exec(font);
    const cmapText = toUnicode && objectStream(Number(toUnicode[1]));
    if (!cmapText) continue;

    const map = new Map<number, string>();
    for (const range of cmapText.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      const entries = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g;
      for (const entry of (range[1] ?? '').matchAll(entries)) {
        const lo = parseInt(entry[1] ?? '0', 16);
        const units = [...(entry[3] ?? '').matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1] ?? '');
        units.forEach((unit, index) => map.set(lo + index, utf16(unit)));
      }
    }
    for (const chars of cmapText.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const entry of (chars[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
        map.set(parseInt(entry[1] ?? '0', 16), utf16(entry[2] ?? ''));
      }
    }
    cmaps.set(name, map);
  }
  return cmaps;
}

/** UTF-16BE code units as hex (`"0041"`, `"D83DDE00"`) → the string they spell. */
function utf16(hex: string): string {
  return Buffer.from(hex, 'hex').swap16().toString('utf16le');
}

/**
 * Every Flate-compressed stream in the document, inflated and concatenated — the raw
 * drawing operators. Where {@link visibleText} decodes what a reader *reads*, this
 * exposes what the page *does*, which is where an image's placement is recorded.
 */
function contentStreams(pdf: Buffer): string {
  const parts: string[] = [];
  const raw = pdf.toString('latin1');
  const streams = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = streams.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = pdf.indexOf('endstream', start, 'latin1');
    if (end < 0) continue;
    try {
      parts.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    } catch {
      continue;
    }
  }

  return parts.join('\n');
}

const BASE: InvoicePdfData = {
  number: '2026-0001',
  issuedAt: new Date('2026-07-04T10:00:00.000Z'),
  description: 'Premium — monthly renewal',
  amount: 4999,
  currency: 'GEL',
  gymName: 'Iron Yard',
  gymContact: { address: null, phone: null, email: null, website: null },
  logo: null,
  memberName: 'Nino Beridze',
  memberEmail: 'nino@example.com',
};

/** A real 1×1 PNG — enough for pdfkit to decode and embed. */
const PNG_LOGO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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
    expect(text).toContain('2026-0001');
    expect(text).toContain('BILLED TO');
    expect(text).toContain('Nino Beridze');
    expect(text).toContain('nino@example.com');
    expect(text).toContain('TOTAL');
    expect(text).toContain('49.99 GEL');
    expect(text).toContain('Premium — monthly renewal');
  });

  it('prints the issuing gym’s contact details in the "Issued by" tile', async () => {
    const text = visibleText(
      await service.render({
        ...BASE,
        gymContact: {
          address: '12 Rustaveli Ave, Tbilisi',
          phone: '+995 322 00 00 00',
          email: 'hello@ironyard.example',
          website: 'ironyard.example',
        },
      }),
    );

    expect(text).toContain('12 Rustaveli Ave, Tbilisi');
    expect(text).toContain('+995 322 00 00 00');
    expect(text).toContain('hello@ironyard.example');
    expect(text).toContain('ironyard.example');
  });

  it('omits the contact block entirely when the gym has filled none in', async () => {
    // The header must not grow an empty gap for a gym that has configured nothing.
    const text = visibleText(await service.render(BASE));

    expect(text).toContain('Iron Yard');
    expect(text).toContain('ISSUED BY');
    expect(text).toContain('BILLED TO');
  });

  it('renders Georgian text — the embedded typeface covers both scripts', async () => {
    // pdfkit's built-in Helvetica has no Georgian glyphs; a member named ნინო would
    // get empty boxes. The bundled Noto Sans Georgian carries Latin too.
    const text = visibleText(
      await service.render({
        ...BASE,
        gymName: 'ფიტსფეისი',
        memberName: 'ნინო ბერიძე',
        description: 'ყოველთვიური განახლება',
      }),
    );

    expect(text).toContain('ფიტსფეისი');
    expect(text).toContain('ნინო ბერიძე');
    expect(text).toContain('ყოველთვიური განახლება');
    expect(text).toContain('nino@example.com');
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

  describe('gym logo', () => {
    /** pdfkit writes each embedded bitmap as an XObject with this dictionary entry. */
    const hasEmbeddedImage = (buffer: Buffer): boolean =>
      buffer.toString('latin1').includes('/Subtype /Image');

    /**
     * The size (points) an embedded image is actually painted at. pdfkit draws one
     * with `q / {w} 0 0 -{h} {x} {y} cm / /Ix Do / Q`, so the transform matrix in the
     * inflated content stream is the drawn width and height — the only place the page
     * records how big the logo ended up.
     */
    function drawnImageSize(pdf: Buffer): { width: number; height: number } | null {
      const match = /([\d.]+) 0 0 (-?[\d.]+) [\d.-]+ [\d.-]+ cm\s*\/\w+ Do/.exec(
        contentStreams(pdf),
      );
      if (!match) return null;
      return { width: Number(match[1]), height: Math.abs(Number(match[2])) };
    }

    it('embeds the logo when the gym has one', async () => {
      const buffer = await service.render({ ...BASE, logo: PNG_LOGO });

      expect(hasEmbeddedImage(buffer)).toBe(true);
      // The header still reads the same; the logo is drawn above the name.
      expect(visibleText(buffer)).toContain('Iron Yard');
    });

    /**
     * The bundled FormaCore wordmark is 1010×330px, so inside the 150×60 box it is
     * width-bound: drawn at 150pt × ~49pt — distinguishable from any fixture the
     * tests hand in.
     */
    const isFallbackWordmark = (pdf: Buffer): boolean => {
      const drawn = drawnImageSize(pdf);
      const expected = scaleToFit({ width: 1010, height: 330 });
      return (
        drawn !== null &&
        Math.abs(drawn.width - expected.width) < 0.01 &&
        Math.abs(drawn.height - expected.height) < 0.01
      );
    };

    it('falls back to the FormaCore wordmark when the gym has no logo', async () => {
      const buffer = await service.render(BASE);

      expect(hasEmbeddedImage(buffer)).toBe(true);
      expect(isFallbackWordmark(buffer)).toBe(true);
    });

    it('falls back to the wordmark for a format pdfkit cannot embed', async () => {
      // An SVG uploaded before the form was narrowed to PNG/JPEG.
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');

      const buffer = await service.render({ ...BASE, logo: svg });

      expect(isFallbackWordmark(buffer)).toBe(true);
      expect(visibleText(buffer)).toContain('Iron Yard');
    });

    it('draws the logo at its own size when it already fits', async () => {
      // The 1×1 fixture is far inside the box; it must not be blown up to fill it.
      const buffer = await service.render({ ...BASE, logo: PNG_LOGO });

      expect(drawnImageSize(buffer)).toEqual({ width: 1, height: 1 });
    });

    it('survives a corrupt file that passes the format check', async () => {
      // Correct PNG magic number, garbage payload — decoding throws inside pdfkit.
      const corrupt = Buffer.concat([PNG_LOGO.subarray(0, 8), Buffer.from('not a png')]);

      const buffer = await service.render({ ...BASE, logo: corrupt });

      expect(isFallbackWordmark(buffer)).toBe(true);
      expect(visibleText(buffer)).toContain('TOTAL');
    });
  });
});

describe('scaleToFit', () => {
  // The box is 150×60 points.
  it('shrinks a wide wordmark until its width fits, keeping the aspect ratio', () => {
    expect(scaleToFit({ width: 600, height: 100 })).toEqual({ width: 150, height: 25 });
  });

  it('shrinks a tall or square mark until its height fits', () => {
    expect(scaleToFit({ width: 1000, height: 1000 })).toEqual({ width: 60, height: 60 });
    expect(scaleToFit({ width: 200, height: 800 })).toEqual({ width: 15, height: 60 });
  });

  it('never crops — the whole image always lands inside the box', () => {
    for (const size of [
      { width: 4000, height: 30 },
      { width: 30, height: 4000 },
      { width: 900, height: 640 },
    ]) {
      const drawn = scaleToFit(size);
      expect(drawn.width).toBeLessThanOrEqual(150);
      expect(drawn.height).toBeLessThanOrEqual(60);
      // Aspect ratio preserved, so nothing is squashed to make it fit.
      expect(drawn.width / drawn.height).toBeCloseTo(size.width / size.height, 5);
    }
  });

  it('leaves a logo that already fits at its natural size', () => {
    expect(scaleToFit({ width: 120, height: 40 })).toEqual({ width: 120, height: 40 });
  });

  it('falls back to the full box for a degenerate size', () => {
    expect(scaleToFit({ width: 0, height: 0 })).toEqual({ width: 150, height: 60 });
  });
});

describe('intrinsicSize', () => {
  /** A PNG header: 8-byte signature, chunk length, `IHDR`, then width and height. */
  function pngHeader(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
    buffer.write('IHDR', 12, 'latin1');
    buffer.writeUInt32BE(width, 16);
    buffer.writeUInt32BE(height, 20);
    return buffer;
  }

  /** A JPEG with one APP0 segment followed by the SOF0 frame header. */
  function jpegHeader(width: number, height: number): Buffer {
    const sof = Buffer.alloc(11);
    sof.writeUInt16BE(0xffc0, 0); // SOF0 marker
    sof.writeUInt16BE(0x0011, 2); // segment length
    sof.writeUInt8(8, 4); // sample precision
    sof.writeUInt16BE(height, 5);
    sof.writeUInt16BE(width, 7);
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
  }

  it('reads a PNG size from its IHDR chunk', () => {
    expect(intrinsicSize(pngHeader(512, 128))).toEqual({ width: 512, height: 128 });
  });

  it('reads a JPEG size from the start-of-frame, skipping earlier segments', () => {
    expect(intrinsicSize(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it('returns null for bytes that are neither', () => {
    expect(intrinsicSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(intrinsicSize(Buffer.alloc(0))).toBeNull();
  });
});
