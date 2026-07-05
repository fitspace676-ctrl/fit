import { describe, expect, it } from 'vitest';
import type { ListPackagesQuery } from '@fit/types';
import { PackagesService } from './packages.service';

describe('PackagesService', () => {
  const service = new PackagesService();

  it('honours the wire contract with an empty list until the query lands', async () => {
    const query = { gymId: 'gym-1' } as ListPackagesQuery;
    await expect(service.listPackages(query)).resolves.toEqual({ packages: [] });
  });

  it('accepts an optional location scope without failing', async () => {
    const query = { gymId: 'gym-1', locationId: 'loc-1' } as ListPackagesQuery;
    await expect(service.listPackages(query)).resolves.toEqual({ packages: [] });
  });
});
