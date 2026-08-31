import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { REPORT_CATALOG, type ReportCatalogResponse, type ReportResult } from '@fit/types';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

function setup() {
  const catalog = vi.fn<() => Promise<ReportCatalogResponse>>(() =>
    Promise.resolve({ reports: REPORT_CATALOG }),
  );
  const runReport = vi.fn<() => Promise<ReportResult>>(() =>
    Promise.resolve({
      key: 'revenue-by-channel',
      name: 'Revenue by channel',
      range: '30d',
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
    // Filtering by the gym's report-visibility settings is the service's job
    // (see reports.service.spec.ts); the controller just has to hand back
    // whatever the service resolves to, unmodified.
    it('delegates to the service and returns its catalogue', async () => {
      const { controller, catalog } = setup();

      const result = await controller.catalog();

      expect(catalog).toHaveBeenCalledOnce();
      expect(result).toEqual({ reports: REPORT_CATALOG });
    });
  });

  describe('run', () => {
    it('parses the report key + range and delegates to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { range: '12m' });
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', { range: '12m' });
    });

    it('defaults the range when omitted', async () => {
      const { controller, runReport } = setup();
      await controller.run('membership-movement', {});
      expect(runReport).toHaveBeenCalledWith('membership-movement', { range: '30d' });
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

    it('passes the branch through to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { range: '30d', locationId: 'loc-1' });
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', {
        range: '30d',
        locationId: 'loc-1',
      });
    });

    it('omits the branch entirely when none is given', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', {});
      // Absent, not `locationId: undefined` — "all branches" is the absence of the
      // parameter, and the service must not have to tell the two apart.
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', { range: '30d' });
    });

    // The console normalises its `'all'` sentinel to an absent param, so an empty
    // string arriving here is a wiring bug — surfaced rather than read as "all".
    it('rejects an empty locationId with 400', async () => {
      const { controller } = setup();
      await expect(controller.run('revenue-by-channel', { locationId: '' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('export', () => {
    it('streams CSV with the attachment headers by default', async () => {
      const { controller, streamReportCsv } = setup();
      const out = responseDouble();

      await controller.export('revenue-by-channel', { range: '30d' }, out.res);

      expect(streamReportCsv).toHaveBeenCalledWith('revenue-by-channel', {
        range: '30d',
        format: 'csv',
      });
      expect(out.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(out.headers['Content-Disposition']).toBe(
        'attachment; filename="report-revenue-by-channel-30d.csv"',
      );
      expect(out.chunks.join('')).toContain('Channel,Net');
      expect(out.ended).toBe(true);
    });

    it('sends the XLSX workbook with the spreadsheet content type', async () => {
      const { controller, buildReportXlsx } = setup();
      const out = responseDouble();

      await controller.export('attendance-by-class', { format: 'xlsx' }, out.res);

      expect(buildReportXlsx).toHaveBeenCalledWith('attendance-by-class', {
        range: '30d',
        format: 'xlsx',
      });
      expect(out.headers['Content-Type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(out.headers['Content-Disposition']).toBe(
        'attachment; filename="report-attendance-by-class-30d.xlsx"',
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

    // A downloaded file that covers a different set of branches from the screen it
    // was downloaded from is worse than no filter at all — the reader cannot tell
    // which figure is the real one. Both formats are pinned, since they are two
    // separate service calls.
    it('carries the branch into both the CSV and the XLSX download', async () => {
      const { controller, streamReportCsv, buildReportXlsx } = setup();

      await controller.export(
        'revenue-by-channel',
        { range: '30d', locationId: 'loc-1' },
        responseDouble().res,
      );
      await controller.export(
        'revenue-by-channel',
        { range: '30d', format: 'xlsx', locationId: 'loc-1' },
        responseDouble().res,
      );

      expect(streamReportCsv).toHaveBeenCalledWith('revenue-by-channel', {
        range: '30d',
        format: 'csv',
        locationId: 'loc-1',
      });
      expect(buildReportXlsx).toHaveBeenCalledWith('revenue-by-channel', {
        range: '30d',
        format: 'xlsx',
        locationId: 'loc-1',
      });
    });
  });
});
