import { describe, expect, it, vi } from 'vitest';
import { findDefaultLocationId, type DefaultLocationClient } from './default-location';
import { LocationsService } from './locations.service';
import type { PrismaService } from '../prisma/prisma.service';

/** A client whose `location.findFirst` answers with `found`, recording the args. */
function client(found: { id: string } | null) {
  const findFirst = vi.fn<DefaultLocationClient['location']['findFirst']>(() =>
    Promise.resolve(found),
  );
  return { client: { location: { findFirst } }, findFirst };
}

describe('findDefaultLocationId', () => {
  it('asks the scoped client for the default without naming the gym', async () => {
    const { client: scoped, findFirst } = client({ id: 'loc-default' });

    await expect(findDefaultLocationId(scoped)).resolves.toBe('loc-default');
    // The exact `where` the scoped callers always sent — the extension adds `gymId`.
    expect(findFirst).toHaveBeenCalledWith({ where: { isDefault: true }, select: { id: true } });
  });

  it('pins the gym explicitly when one is given', async () => {
    const { client: base, findFirst } = client({ id: 'loc-default' });

    await expect(findDefaultLocationId(base, 'gym-1')).resolves.toBe('loc-default');
    expect(findFirst).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', isDefault: true },
      select: { id: true },
    });
  });

  it('is null for a gym with no default branch, leaving the decision to the caller', async () => {
    const { client: base } = client(null);

    await expect(findDefaultLocationId(base, 'gym-1')).resolves.toBeNull();
  });

  it('does not filter on status — a deactivated default is still the default', async () => {
    const { client: base, findFirst } = client({ id: 'loc-closed' });

    await expect(findDefaultLocationId(base, 'gym-1')).resolves.toBe('loc-closed');
    expect(findFirst.mock.calls[0]?.[0].where).not.toHaveProperty('status');
  });
});

describe('LocationsService.defaultLocation', () => {
  it('resolves the named gym’s default on the base client', async () => {
    const { client: base, findFirst } = client({ id: 'loc-default' });
    const service = new LocationsService({ client: base } as unknown as PrismaService);

    await expect(service.defaultLocation('gym-1')).resolves.toBe('loc-default');
    expect(findFirst).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', isDefault: true },
      select: { id: true },
    });
  });
});
