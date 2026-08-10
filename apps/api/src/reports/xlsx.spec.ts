import { describe, expect, it } from 'vitest';
import type { ReportXlsxCell } from '@fit/types';
import { buildReportWorkbook, buildWorkbook } from './xlsx';

/** The literal bytes of a stored (uncompressed) ZIP entry appear verbatim, so the
 *  worksheet XML can be asserted directly against the workbook buffer's text. */
function asText(buffer: Buffer): string {
  return buffer.toString('latin1');
}

const headers = ['Channel', 'Net'];
const rows: ReportXlsxCell[][] = [
  [
    { type: 'text', value: 'POS' },
    { type: 'number', value: 45 },
  ],
  [
    { type: 'text', value: 'ONLINE & co' },
    { type: 'number', value: 12.5 },
  ],
];

describe('buildReportWorkbook', () => {
  it('produces a ZIP workbook with the OOXML parts', () => {
    const workbook = buildReportWorkbook('Revenue by channel', headers, rows);
    expect(workbook).toBeInstanceOf(Buffer);
    // ZIP local file header magic.
    expect(workbook.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const text = asText(workbook);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('xl/workbook.xml');
    expect(text).toContain('xl/worksheets/sheet1.xml');
  });

  it('writes header + data rows with inline strings and numeric values', () => {
    const text = asText(buildReportWorkbook('Report', headers, rows));
    expect(text).toContain('<t xml:space="preserve">Channel</t>');
    expect(text).toContain('<t xml:space="preserve">POS</t>');
    // Numbers are bare <v> values so Excel treats them numerically.
    expect(text).toContain('<v>45</v>');
    expect(text).toContain('<v>12.5</v>');
  });

  it('XML-escapes text cells and the sheet name', () => {
    const text = asText(buildReportWorkbook('A/B:C', headers, rows));
    expect(text).toContain('ONLINE &amp; co');
    // Reserved sheet-name chars are replaced with spaces.
    expect(text).toContain('name="A B C"');
  });

  it('records every part in the end-of-central-directory (5 entries)', () => {
    const workbook = buildReportWorkbook('Report', headers, rows);
    const eocd = workbook.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocd).toBeGreaterThan(-1);
    // Total-entries field is 2 bytes at offset +10 from the EOCD signature.
    expect(workbook.readUInt16LE(eocd + 10)).toBe(5);
  });

  it('handles an empty data set (header row only)', () => {
    const text = asText(buildReportWorkbook('Empty', headers, []));
    expect(text).toContain('<t xml:space="preserve">Channel</t>');
    expect(text).toContain('<row r="1">');
    expect(text).not.toContain('<row r="2">');
  });
});

describe('buildWorkbook (multi-sheet)', () => {
  it('writes one worksheet part, override and relationship per sheet', () => {
    const workbook = buildWorkbook([
      { name: 'Net sales over time', headers: ['Period', 'Value'], rows: [] },
      { name: 'Sales by payment method', headers: ['Method', 'Value'], rows: [] },
      { name: 'Recent refunds', headers: ['Date', 'Amount'], rows: [] },
    ]);
    const text = asText(workbook);

    for (const n of [1, 2, 3]) {
      expect(text).toContain(`xl/worksheets/sheet${n}.xml`);
      expect(text).toContain(`sheetId="${n}" r:id="rId${n}"`);
      expect(text).toContain(`Target="worksheets/sheet${n}.xml"`);
    }
    // 4 fixed parts + 3 worksheets.
    const eocd = workbook.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(workbook.readUInt16LE(eocd + 10)).toBe(7);
  });

  it('keeps each sheet’s own rows on its own sheet', () => {
    const text = asText(
      buildWorkbook([
        { name: 'One', headers: ['A'], rows: [[{ type: 'text', value: 'first-sheet' }]] },
        { name: 'Two', headers: ['B'], rows: [[{ type: 'text', value: 'second-sheet' }]] },
      ]),
    );
    const firstAt = text.indexOf('first-sheet');
    const secondAt = text.indexOf('second-sheet');
    const sheet2At = text.indexOf('xl/worksheets/sheet2.xml');
    expect(firstAt).toBeGreaterThan(-1);
    // The second sheet's data lives after the second sheet part begins.
    expect(secondAt).toBeGreaterThan(sheet2At);
  });

  it('disambiguates duplicate tab names, which Excel refuses', () => {
    const text = asText(
      buildWorkbook([
        { name: 'Sales', headers: ['A'], rows: [] },
        { name: 'Sales', headers: ['A'], rows: [] },
      ]),
    );
    expect(text).toContain('name="Sales"');
    expect(text).toContain('name="Sales 2"');
  });

  it('still produces a valid workbook when handed no sheets at all', () => {
    const workbook = buildWorkbook([]);
    expect(asText(workbook)).toContain('xl/worksheets/sheet1.xml');
  });
});
