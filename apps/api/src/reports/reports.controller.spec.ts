import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  DEFAULT_REPORT_RANGE,
  GYM_WIDE_REPORT_KEYS,
  REPORT_CATALOG,
  REPORT_SEGMENT_LABEL,
  type ReportCatalogResponse,
  type ReportResult,
} from '@fit/types';
import { recordRequestAccess } from '../common/rbac/request-access';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';

/**
 * A request carrying the answer `PermissionsGuard` would have recorded: gym-wide
 * (`all`), restricted to one branch (`assigned`), or none at all (`null`).
 */
function requestFor(branchScope: 'all' | 'assigned' | null): Request {
  const req = {} as Request;
  if (branchScope !== null) {
    recordRequestAccess(req, {
      role: branchScope === 'all' ? 'MANAGER' : 'RECEPTIONIST',
      grants: [],
      branchScope,
      allowedLocationIds: branchScope === 'all' ? null : ['loc-1'],
      defaultLocationId: branchScope === 'all' ? null : 'loc-1',
    });
  }
  return req;
}

const wholeGym = () => requestFor('all');

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
      await controller.catalog(wholeGym(), 'ka');
      expect(catalog).toHaveBeenCalledWith('ka', { includeHidden: false });
    });

    it('lists hidden reports too when asked with ?all=true, for the settings screen', async () => {
      const { controller, catalog } = setup();
      await controller.catalog(wholeGym(), undefined, 'true');
      expect(catalog).toHaveBeenCalledWith(null, { includeHidden: true });
    });

    // Filtering by the gym's report-visibility settings is the service's job
    // (see reports.service.spec.ts); the controller just has to hand back
    // whatever the service resolves to, unmodified.
    it('delegates to the service and returns its catalogue', async () => {
      const { controller, catalog } = setup();

      const result = await controller.catalog(wholeGym());

      expect(catalog).toHaveBeenCalledOnce();
      expect(result).toEqual({ reports: REPORT_CATALOG, segments: REPORT_SEGMENT_LABEL });
    });
  });

  describe('run', () => {
    it('parses the report key + range and delegates to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { range: 'today' }, wholeGym());
      // No Accept-Language on the call: `null` lets the service fall back to the gym's language.
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', { range: 'today' }, null);
    });

    it('hands the Accept-Language locale to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run(
        'revenue-by-channel',
        { range: 'today' },
        wholeGym(),
        'ka-GE,ka;q=0.9,en;q=0.8',
      );
      expect(runReport).toHaveBeenCalledWith('revenue-by-channel', { range: 'today' }, 'ka');
    });

    it('defaults the range when omitted', async () => {
      const { controller, runReport } = setup();
      await controller.run('membership-movement', {}, wholeGym());
      expect(runReport).toHaveBeenCalledWith('membership-movement', { range: 'mtd' }, null);
    });

    it('rejects an unknown report key with 400', async () => {
      const { controller } = setup();
      await expect(controller.run('not-a-report', {}, wholeGym())).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an invalid range with 400', async () => {
      const { controller } = setup();
      await expect(
        controller.run('no-show-rate', { range: '1y' }, wholeGym()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // The service is currently ignoring the branch — see
    // docs/superpowers/plans/2026-09-02-restore-report-branch-filter.md — but the
    // plumbing that carries it is intact and stays pinned, because the parsing and
    // the filtering fail differently and only one of them is outstanding.
    it('passes the branch through to the service', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { range: '7d', locationId: 'loc-1' }, wholeGym());
      expect(runReport).toHaveBeenCalledWith(
        'revenue-by-channel',
        { range: '7d', locationId: 'loc-1' },
        null,
      );
    });

    it('omits the branch entirely when none is given', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', {}, wholeGym());
      // Absent, not `locationId: undefined` — "all branches" is the absence of the
      // parameter, and the service must not have to tell the two apart.
      expect(runReport).toHaveBeenCalledWith(
        'revenue-by-channel',
        { range: DEFAULT_REPORT_RANGE },
        null,
      );
    });

    // The console normalises its `'all'` sentinel to an absent param, so an empty
    // string arriving here is a wiring bug — surfaced rather than read as "all".
    it('rejects an empty locationId with 400', async () => {
      const { controller } = setup();
      await expect(
        controller.run('revenue-by-channel', { locationId: '' }, wholeGym()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('export', () => {
    it('streams CSV with the attachment headers by default', async () => {
      const { controller, streamReportCsv } = setup();
      const out = responseDouble();

      await controller.export('revenue-by-channel', { range: 'mtd' }, wholeGym(), out.res);

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
        wholeGym(),
        out.res,
      );
      expect(out.headers['Content-Disposition']).toBe(
        'attachment; filename="report-revenue-by-channel-2026-08-01_2026-08-15.csv"',
      );
    });

    it('sends the XLSX workbook with the spreadsheet content type', async () => {
      const { controller, buildReportXlsx } = setup();
      const out = responseDouble();

      await controller.export('attendance-by-class', { format: 'xlsx' }, wholeGym(), out.res);

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
      await expect(controller.export('nope', {}, wholeGym(), out.res)).rejects.toBeInstanceOf(
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
        { range: '7d', locationId: 'loc-1' },
        wholeGym(),
        responseDouble().res,
      );
      await controller.export(
        'revenue-by-channel',
        { range: '7d', format: 'xlsx', locationId: 'loc-1' },
        wholeGym(),
        responseDouble().res,
      );

      expect(streamReportCsv).toHaveBeenCalledWith(
        'revenue-by-channel',
        { range: '7d', format: 'csv', locationId: 'loc-1' },
        null,
      );
      expect(buildReportXlsx).toHaveBeenCalledWith(
        'revenue-by-channel',
        { range: '7d', format: 'xlsx', locationId: 'loc-1' },
        null,
      );
    });
  });

  // A branch-restricted operator has no gym-wide view, so the reports whose data
  // cannot be narrowed to a branch are refused to them outright — the guard's
  // forced `locationId` would be ignored by those reports and leak every branch.
  describe('gym-wide reports and branch scope', () => {
    const GYM_WIDE = [...GYM_WIDE_REPORT_KEYS];

    it.each(GYM_WIDE)('403s a restricted preview of %s', async (key) => {
      const { controller, runReport } = setup();
      const error = await controller
        .run(key, { locationId: 'loc-1' }, requestFor('assigned'))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'BRANCH_FORBIDDEN',
      });
      expect(runReport).not.toHaveBeenCalled();
    });

    it.each(GYM_WIDE)('403s a restricted export of %s, in both formats', async (key) => {
      const { controller, streamReportCsv, buildReportXlsx } = setup();
      for (const format of ['csv', 'xlsx']) {
        const out = responseDouble();
        await expect(
          controller.export(key, { format }, requestFor('assigned'), out.res),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(out.headers).toEqual({});
      }
      expect(streamReportCsv).not.toHaveBeenCalled();
      expect(buildReportXlsx).not.toHaveBeenCalled();
    });

    it.each(GYM_WIDE)('serves %s to a gym-wide caller', async (key) => {
      const { controller, runReport, streamReportCsv } = setup();
      await controller.run(key, {}, wholeGym());
      await controller.export(key, {}, wholeGym(), responseDouble().res);
      expect(runReport).toHaveBeenCalledOnce();
      expect(streamReportCsv).toHaveBeenCalledOnce();
    });

    it('still serves a branch-aware report to a restricted caller', async () => {
      const { controller, runReport } = setup();
      await controller.run('revenue-by-channel', { locationId: 'loc-1' }, requestFor('assigned'));
      expect(runReport).toHaveBeenCalledOnce();
    });

    // No recorded scope is not evidence of a gym-wide one.
    it('fails closed when the guard recorded no access', async () => {
      const { controller } = setup();
      await expect(controller.run('audit-log', {}, requestFor(null))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const { reports } = await controller.catalog(requestFor(null));
      expect(reports.map((report) => report.key)).not.toContain('audit-log');
    });

    it('drops the gym-wide reports from a restricted catalogue, hidden ones included', async () => {
      const { controller } = setup();
      for (const all of [undefined, 'true']) {
        const { reports, segments } = await controller.catalog(
          requestFor('assigned'),
          undefined,
          all,
        );
        const keys = reports.map((report) => report.key);
        for (const key of GYM_WIDE) {
          expect(keys).not.toContain(key);
        }
        // Everything else stays: only a key on the gym-wide list is dropped (not every
        // gym-wide key is offered in the catalogue, so count what is, not the list).
        expect(keys).toHaveLength(
          REPORT_CATALOG.filter(
            (report) => !(GYM_WIDE_REPORT_KEYS as readonly string[]).includes(report.key),
          ).length,
        );
        expect(segments).toEqual(REPORT_SEGMENT_LABEL);
      }
    });

    it('lists every report for a gym-wide caller', async () => {
      const { controller } = setup();
      const { reports } = await controller.catalog(wholeGym());
      expect(reports).toHaveLength(REPORT_CATALOG.length);
    });
  });
});
