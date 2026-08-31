import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import {
  REPORT_CATALOG,
  REPORT_SEGMENT_LABEL,
  type ReportCatalogResponse,
  type ReportResult,
} from '@fit/types';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

function setup() {
  const catalog = vi.fn<() => Promise<ReportCatalogResponse>>(() =>
    Promise.resolve({ reports: REPORT_CATALOG, segments: REPORT_SEGMENT_LABEL }),
  );
  const runReport = vi.fn<() => Promise<ReportResult>>(() =>
    Promise.resolve({
      key: 'revenue-by-channel',
      name: 'Revenue by channel',
      range: 'mtd',
      from: '2026-08-01',
      to: '2026-08-31',
      currency: 'GEL',
      columns: [],
      rows: [],
    }),
  );
  async function* csv(): AsyncGenerator<string> {
    await Promise.resolve();
    yield 'Channel,Net\r\n';
    yield 'POS,45.00\r\n';
  }
  const streamReportCsv = vi.fn(() => csv());
  const buildReportXlsx = vi.fn<() => Promise<Buffer>>(() => Promise.resolve(Buffer.from('xlsx')));

  const service = {
    catalog,
    runReport,
    streamReportCsv,
    buildReportXlsx,
  } as unknown as ReportsService;
  return {
    controller: new ReportsController(service),
    catalog,
    runReport,
    streamReportCsv,
    buildReportXlsx,
  };
}

/** A minimal Express response double capturing headers, streamed chunks, and body. */
function responseDouble() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  let body: unknown;
  let ended = false;
  const res = {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    write: vi.fn((c: string) => {
      chunks.push(c);
    }),
    send: vi.fn((b: unknown) => {
      body = b;
    }),
    end: vi.fn(() => {
      ended = true;
    }),
  } as unknown as Response;
  return {
    res,
    headers,
    chunks,
    get body() {
      return body;
    },
    get ended() {
      return ended;
    },
  };
}

describe('ReportsController', () => {
  afterEach(() => vi.clearAllMocks());

  describe('catalog', () => {
    it('hands the Accept-Language locale to the service', async () => {
      const { controller, catalog } = setup();
      await controller.catalog('ka');
      expect(catalog).toHaveBeenCalledWith('ka', { includeHidden: false });
    });

    it('lists hidden reports too when asked with ?all=true, for the settings screen', async () => {
      const { controller, catalog } = setup();
      await controller.catalog(undefined, 'true');
      expect(catalog).toHaveBeenCalledWith(null, { includeHidden: true });
    });

    // Filtering by the gym's report-visibility settings is the service's job
    // (see reports.service.spec.ts); the controller just has to hand back
    // whatever the service resolves to, unmodified.
    it('delegates to the service and returns its catalogue', async () => {
      const { controller, catalog } = setup();

      const result = await controller.catalog();

      expect(catalog).toHaveBeenCalledOnce();
      expect(result).toEqual({ reports: REPORT_CATALOG, segments: REPORT_SEGMENT_LABEL });
    });
  });

  describe('run', () => {
    it('parses the report key + range and delegates to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { range: 'today' });
      // No Accept-Language on the call: `null` lets the service fall back to the gym's language.
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', { range: 'today' }, null);
    });

    it('hands the Accept-Language locale to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { range: 'today' }, 'ka-GE,ka;q=0.9,en;q=0.8');
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', { range: 'today' }, 'ka');
    });

    it('defaults the range when omitted', async () => {
      const { controller, runReport } = setup();
      await controller.run('membership-movement', {});
      expect(runReport).toHaveBeenCalledWith('membership-movement', { range: 'mtd' }, null);
    });

    it('rejects an unknown report key with 400', async () => {
      const { controller } = setup();
      await expect(controller.run('not-a-report', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid range with 400', async () => {
      const { controller } = setup();
      await expect(controller.run('no-show-rate', { range: '1y' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('export', () => {
    it('streams CSV with the attachment headers by default', async () => {
      const { controller, streamReportCsv } = setup();
      const out = responseDouble();

      await controller.export('revenue-by-channel', { range: 'mtd' }, out.res);

      expect(streamReportCsv).toHaveBeenCalledWith(
        'revenue-by-channel',
        { range: 'mtd', format: 'csv' },
        null,
      );
      expect(out.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(out.headers['Content-Disposition']).toBe(
        'attachment; filename="report-revenue-by-channel-mtd.csv"',
      );
      expect(out.chunks.join('')).toContain('Channel,Net');
      expect(out.ended).toBe(true);
    });

    it('names a custom-range file after its two days', async () => {
      const { controller } = setup();
      const out = responseDouble();
      await controller.export(
        'revenue-by-channel',
        { range: 'custom', from: '2026-08-01', to: '2026-08-15' },
        out.res,
      );
      expect(out.headers['Content-Disposition']).toBe(
        'attachment; filename="report-revenue-by-channel-2026-08-01_2026-08-15.csv"',
      );
    });

    it('sends the XLSX workbook with the spreadsheet content type', async () => {
      const { controller, buildReportXlsx } = setup();
      const out = responseDouble();

      await controller.export('attendance-by-class', { format: 'xlsx' }, out.res);

      expect(buildReportXlsx).toHaveBeenCalledWith(
        'attendance-by-class',
        { range: 'mtd', format: 'xlsx' },
        null,
      );
      expect(out.headers['Content-Type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(out.headers['Content-Disposition']).toBe(
        'attachment; filename="report-attendance-by-class-mtd.xlsx"',
      );
      expect(out.body).toEqual(Buffer.from('xlsx'));
    });

    it('rejects an unknown report key with 400', async () => {
      const { controller } = setup();
      const out = responseDouble();
      await expect(controller.export('nope', {}, out.res)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
