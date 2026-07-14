// @fit/admin — normalize uploaded attachments to types the models accept.
//
// Claude and Gemini accept images, PDFs, and text inline — but NOT Office
// binaries (xlsx/xls), which otherwise make the model 400 ("Unsupported MIME
// type"). We convert spreadsheets to CSV text server-side (so "import users from
// this Excel file" just works), and replace any other unsupported binary with a
// short text note so a stray file never crashes the turn.

import * as XLSX from 'xlsx';
import type { AgentAttachment } from './driver';

/** Spreadsheet by MIME or file extension. */
function isSpreadsheet(a: AgentAttachment): boolean {
  return /spreadsheet|ms-excel|excel/i.test(a.mimeType) || /\.(xlsx|xls|xlsm)$/i.test(a.name);
}

/** MIME types the models take inline as-is (images, PDF, text-family). */
function isModelReady(mimeType: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType === 'application/json'
  );
}

function encodeText(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/** Read an xlsx/xls attachment and flatten every sheet to CSV text. */
function spreadsheetToCsv(a: AgentAttachment): AgentAttachment {
  try {
    const wb = XLSX.read(Buffer.from(a.data, 'base64'), { type: 'buffer' });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet);
      parts.push(wb.SheetNames.length > 1 ? `# Sheet: ${name}\n${csv}` : csv);
    }
    return { name: `${a.name}.csv`, mimeType: 'text/csv', data: encodeText(parts.join('\n\n')) };
  } catch {
    return {
      name: a.name,
      mimeType: 'text/plain',
      data: encodeText(`[Could not read the spreadsheet "${a.name}".]`),
    };
  }
}

/** Make every attachment safe to send to the model. */
export function normalizeAttachments(attachments: AgentAttachment[]): AgentAttachment[] {
  return attachments.map((a) => {
    if (isSpreadsheet(a)) return spreadsheetToCsv(a);
    if (isModelReady(a.mimeType)) return a;
    return {
      name: a.name,
      mimeType: 'text/plain',
      data: encodeText(
        `[Unsupported file "${a.name}" (${a.mimeType}). Ask the user for CSV, PDF, an image, or plain text.]`,
      ),
    };
  });
}
