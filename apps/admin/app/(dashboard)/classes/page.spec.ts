// `/classes` — the class-types roster asks the API for the active branch's
// catalogue (its exclusive types plus the gym-wide ones), not the whole gym's.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchClassTypes = vi.hoisted(() => vi.fn());
const getActiveLocationId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({ ApiError: class ApiError extends Error {}, fetchClassTypes }));
vi.mock('@/lib/active-location-server', () => ({ getActiveLocationId }));
vi.mock('@/lib/session', () => ({ getServerSession: () => Promise.resolve(null) }));
vi.mock('@fit/ui-kit', () => ({ Card: () => null }));
vi.mock('@/components/ui', () => ({ Icon: () => null }));
vi.mock('@/components/classes-tabs', () => ({ ClassesTabs: () => null }));
vi.mock('./classes-filters', () => ({ ClassTypesFilters: () => null }));
vi.mock('./class-types-table', () => ({ ClassTypesTable: () => null }));
vi.mock('./add-class-type-drawer', () => ({ AddClassTypeDrawer: () => null }));
vi.mock('./options', () => ({ loadRelationOptions: vi.fn() }));

const { default: ClassTypesPage } = await import('./page');

beforeEach(() => {
  fetchClassTypes.mockReset();
  fetchClassTypes.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
  getActiveLocationId.mockReset();
});

describe('class types page', () => {
  it('scopes the roster to the active branch', async () => {
    getActiveLocationId.mockResolvedValue('loc-downtown');

    await ClassTypesPage({ searchParams: Promise.resolve({ search: 'box' }) });

    expect(getActiveLocationId).toHaveBeenCalledWith({ search: 'box' });
    expect(fetchClassTypes).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'box', locationId: 'loc-downtown' }),
    );
  });

  it('lets the resolver override a raw ?locationId= it did not accept', async () => {
    // A deactivated or other gym's branch degrades to "all locations" in the
    // resolver; the unchecked id must not survive in the parsed query.
    getActiveLocationId.mockResolvedValue(undefined);

    await ClassTypesPage({ searchParams: Promise.resolve({ locationId: 'loc-other-gym' }) });

    expect(fetchClassTypes).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: undefined }),
    );
  });
});
