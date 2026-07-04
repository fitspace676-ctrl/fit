import type { ReportXlsxCell } from '@fit/types';

/**
 * A minimal, dependency-free XLSX (Office Open XML SpreadsheetML) writer for the
 * admin reports export (T4.8).
 *
 * An `.xlsx` is a ZIP of XML parts. The gym reports are bounded aggregates (a
 * handful to a few dozen rows), so the whole workbook is assembled in memory and
 * returned as a `Buffer` rather than streamed — true streaming would need the
 * central directory rewritten at the end anyway, and buys nothing at this size.
 *
 * We keep the workbook deliberately tiny: one worksheet, numbers written as bare
 * `<v>` values, text written as inline strings (`t="inlineStr"`) so there is no
 * shared-string table to maintain, and no styles part. Entries are stored
 * uncompressed (ZIP method 0) with a hand-computed CRC-32 — no `zlib`, no archive
 * dependency — which is valid for every spreadsheet reader.
 */

/** Precomputed CRC-32 (IEEE 802.3) lookup table for the ZIP entry checksums. */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of a buffer, as an unsigned 32-bit integer. */
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Escape the five XML-significant characters and drop control chars XML forbids. */
function xmlEscape(value: string): string {
  return (
    value
      // Strip C0 control characters (except tab/newline/CR) that XML 1.0 forbids.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  );
}

/** The A1-style column letter(s) for a zero-based column index (0 → A, 26 → AA). */
function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/**
 * Trim a caller-supplied worksheet name to Excel's rules: at most 31 characters,
 * none of the reserved `\ / ? * [ ] :`, non-empty. Falls back to `Report`.
 */
function sanitizeSheetName(name: string): string {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned.length > 0 ? cleaned : 'Report';
}

/** Render the `<sheetData>` body: a header row of inline strings, then the data rows. */
function sheetXml(headers: string[], rows: ReportXlsxCell[][]): string {
  const allRows: ReportXlsxCell[][] = [
    headers.map((h): ReportXlsxCell => ({ type: 'text', value: h })),
    ...rows,
  ];

  let body = '';
  allRows.forEach((cells, rowIdx) => {
    const rowNum = rowIdx + 1;
    let rowXml = `<row r="${rowNum}">`;
    cells.forEach((cell, colIdx) => {
      const ref = `${columnLetter(colIdx)}${rowNum}`;
      if (cell.type === 'number' && Number.isFinite(cell.value)) {
        rowXml += `<c r="${ref}"><v>${cell.value}</v></c>`;
      } else {
        const text = cell.type === 'text' ? cell.value : String(cell.value);
        rowXml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
      }
    });
    rowXml += '</row>';
    body += rowXml;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData>` +
    '</worksheet>'
  );
}

/** One file to place in the ZIP: its archive path and its raw bytes. */
interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Pack entries into a ZIP archive using the STORED (uncompressed) method with a
 * fixed 1980-01-01 timestamp (deterministic output). Emits the local file headers
 * + data, then the central directory, then the end-of-central-directory record —
 * the standard ZIP layout every reader expects.
 */
function zipStored(entries: ZipEntry[]): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = 0x0021; // 1980-01-01
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(0, 6); // general purpose flag
    local.writeUInt16LE(0, 8); // compression method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // compressed size
    local.writeUInt32LE(size, 22); // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    localParts.push(local, nameBuf, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(0, 8); // general purpose flag
    central.writeUInt16LE(0, 10); // compression method: stored
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // file comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // relative offset of local header
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + entry.data.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // number of this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralBuf.length, 12); // central directory size
  end.writeUInt32LE(offset, 16); // central directory offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralBuf, end]);
}

/**
 * Build a single-sheet XLSX workbook from a header row and typed data rows, and
 * return it as a `Buffer` ready to write to the HTTP response. `sheetName` is
 * trimmed to Excel's constraints; cell types come from {@link ReportXlsxCell}.
 */
export function buildReportWorkbook(
  sheetName: string,
  headers: string[],
  rows: ReportXlsxCell[][],
): Buffer {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';

  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';

  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEscape(sanitizeSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets>` +
    '</workbook>';

  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '</Relationships>';

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml(headers, rows), 'utf8') },
  ];

  return zipStored(entries);
}
