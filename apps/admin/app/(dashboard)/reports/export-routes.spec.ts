// @fit/admin — the two report export route handlers, under a branch filter.
//
// THE OTHER HALF OF THE "THE FILE MATCHES THE SCREEN" PROOF. `reports-view.test.tsx`
// pins screen → link: the preview's download hrefs carry exactly the `locationId`
// the server ran the preview with. This file pins link → file: the export routes
// resolve that param the same way the pages do and forward it upstream, so the
// bytes the browser saves cover the branch the operator was looking at.
//
// The case that makes the chain worth having is the one asserted below as "the
// link outranks a cookie that has moved": a report is previewed for branch A, the
// operator (or another tab) switches the console to branch B, and only then clicks
// CSV. The cookie now says B; the link still says A; the file has to say A,
// because A is what the table on the page in front of them shows.
//
// Both handlers are tested together on purpose — the point is that they AGREE,
// and two files could drift into two different resolutions without either failing.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Permission } from '@fit/types';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  fetchLocations: vi.fn(),
  fetchMyPermissions: vi.fn(),
  fetchReportExport: vi.fn(),
  fetchReportDrilldownExport: vi.fn(),
  cookie: undefined as string | undefined,
}));

vi.mock('@/lib/session', () => ({
  getServerSession: () => mocks.getServerSession() as unknown,
}));

// The branch resolver validates the stored/linked id against the gym's live
// roster, so the roster fetch has to answer. `@/lib/api` and the `./api` that
// `lib/active-location-server.ts` imports are the same module, so one mock covers
// the route handler and the resolver behind it.
// The branch the resolver settles on is now CLAMPED to the ones this operator
// may work at, so the permission resolution has to answer too — see
// `lib/console-permissions.ts`. A gym-wide manager clamps to a no-op, which is
// what keeps every expectation below reading as it did.
vi.mock('@/lib/api', () => ({
  fetchLocations: (...args: unknown[]) => mocks.fetchLocations(...args) as unknown,
  fetchMyPermissions: () => mocks.fetchMyPermissions() as unknown,
  fetchReportExport: (...args: unknown[]) => mocks.fetchReportExport(...args) as unknown,
  fetchReportDrilldownExport: (...args: unknown[]) =>
    mocks.fetchReportDrilldownExport(...args) as unknown,
}));

// A route handler has no `searchParams` prop — the cookie jar is the half of the
// resolution it cannot read off `req.url`.
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'fit-admin-active-location' && mocks.cookie !== undefined
          ? { name, value: mocks.cookie }
          : undefined,
    }),
}));

const { GET: catalogueExport } = await import('./export/route');
const { GET: drilldownExport } = await import('./[metric]/export/route');

/** A staff session that holds `ReportView` (the API re-checks regardless). */
const MANAGER = { userId: 'u1', role: 'MANAGER' };

/** What `GET /me/permissions` says about that manager: gym-wide, so no clamping. */
const MANAGER_PERMISSIONS = {
  role: 'MANAGER',
  grants: [Permission.ReportView, Permission.LocationRead],
  branchScope: 'all',
  assignedLocationIds: [],
};

/** The gym's live branches, as `getActiveLocationId` validates against. */
const LOCATIONS = { data: [{ id: 'loc-1', name: 'Vake' }], meta: {} };

/** A believable upstream file stream, so the handler reaches its happy path. */
function upstreamFile(): Response {
  return new Response('period,net\n2026-08-01,400\n', { status: 200 });
}

beforeEach(() => {
  mocks.getServerSession.mockReset().mockResolvedValue(MANAGER);
  mocks.fetchLocations.mockReset().mockResolvedValue(LOCATIONS);
  mocks.fetchMyPermissions.mockReset().mockResolvedValue(MANAGER_PERMISSIONS);
  mocks.fetchReportExport.mockReset().mockResolvedValue(upstreamFile());
  mocks.fetchReportDrilldownExport.mockReset().mockResolvedValue(upstreamFile());
  mocks.cookie = undefined;
});

/** Invoke the catalogue export route and hand back the query it proxied upstream. */
async function runCatalogue(query: string): Promise<Record<string, unknown>> {
  const res = await catalogueExport(new Request(`https://console.test/reports/export?${query}`));
  expect(res.status).toBe(200);
  return mocks.fetchReportExport.mock.calls[0]?.[1] as Record<string, unknown>;
}

/** Invoke the drill-down export route and hand back the query it proxied upstream. */
async function runDrilldown(metric: string, query: string): Promise<Record<string, unknown>> {
  const res = await drilldownExport(
    new Request(`https://console.test/reports/${metric}/export?${query}`),
    { params: Promise.resolve({ metric }) },
  );
  expect(res.status).toBe(200);
  return mocks.fetchReportDrilldownExport.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe('report export routes — branch resolution', () => {
  it('falls back to the top bar cookie when the link names no branch', async () => {
    mocks.cookie = 'loc-1';
    expect(await runCatalogue('report=sales-summary&range=30d&format=csv')).toMatchObject({
      range: '30d',
      format: 'csv',
      locationId: 'loc-1',
    });

    mocks.cookie = 'loc-1';
    expect(await runDrilldown('sales', 'range=30d&format=xlsx')).toMatchObject({
      range: '30d',
      format: 'xlsx',
      locationId: 'loc-1',
    });
  });

  it('lets the link outrank a cookie that has moved since the page rendered', async () => {
    // The console has been switched to "All locations" in another tab, but this
    // link was built by a page that was scoped to loc-1. The file must match the
    // page, not the switcher.
    mocks.cookie = 'all';
    expect(
      await runCatalogue('report=sales-summary&range=30d&format=csv&locationId=loc-1'),
    ).toMatchObject({ locationId: 'loc-1' });

    mocks.cookie = 'all';
    expect(await runDrilldown('sales', 'range=30d&format=csv&locationId=loc-1')).toMatchObject({
      locationId: 'loc-1',
    });
  });

  it('sends no branch at all for "All locations" — never the `all` sentinel', async () => {
    mocks.cookie = 'all';
    expect(await runCatalogue('report=sales-summary&format=csv')).toMatchObject({
      locationId: undefined,
    });

    mocks.cookie = 'all';
    expect(await runDrilldown('sales', 'format=csv')).toMatchObject({ locationId: undefined });
  });

  it('does not forward the raw param — an id the gym does not have widens to every branch', async () => {
    // A stale bookmark, or a link pasted from another gym. It must hand over MORE
    // data than asked for, never a 400 and never a silently empty file.
    mocks.cookie = undefined;
    expect(
      await runCatalogue('report=sales-summary&format=csv&locationId=loc-deleted'),
    ).toMatchObject({ locationId: undefined });

    expect(await runDrilldown('sales', 'format=csv&locationId=loc-deleted')).toMatchObject({
      locationId: undefined,
    });
  });

  it('degrades to every branch when the roster cannot be read', async () => {
    // `fetchActiveLocations` swallows the failure and answers with an empty
    // roster; nothing may validate against it, so the export widens rather than
    // erroring mid-download.
    mocks.fetchLocations.mockRejectedValue(new Error('api down'));
    mocks.cookie = 'loc-1';
    expect(await runCatalogue('report=sales-summary&format=csv')).toMatchObject({
      locationId: undefined,
    });
  });

  it('still refuses a role without the reporting capability, branch or no branch', async () => {
    mocks.getServerSession.mockResolvedValue({ userId: 'u2', role: 'RECEPTIONIST' });
    mocks.cookie = 'loc-1';

    const res = await catalogueExport(
      new Request('https://console.test/reports/export?report=sales-summary&locationId=loc-1'),
    );
    expect(res.status).toBe(403);
    expect(mocks.fetchReportExport).not.toHaveBeenCalled();
  });
});
