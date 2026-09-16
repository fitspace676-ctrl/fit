import { describe, expect, it, vi } from 'vitest';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { TokenService, VerifiedAccessClaims } from '../auth/token.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PortalBranchService, resolvePortalBranch } from './portal-branch.service';

type Args = { where: Record<string, unknown> };

/** A two-gym world: `loc-a1`/`loc-a2` belong to gym-a, `loc-b1` to gym-b. */
const LOCATIONS = [
  { id: 'loc-a1', gymId: 'gym-a', status: 'ACTIVE' },
  { id: 'loc-a2', gymId: 'gym-a', status: 'ACTIVE' },
  { id: 'loc-a-closed', gymId: 'gym-a', status: 'INACTIVE' },
  { id: 'loc-b1', gymId: 'gym-b', status: 'ACTIVE' },
];

const MEMBERS = [
  { userId: 'u-1', gymId: 'gym-a', role: 'MEMBER', deletedAt: null, locationId: 'loc-a2' },
  { userId: 'u-1', gymId: 'gym-b', role: 'MEMBER', deletedAt: null, locationId: 'loc-b1' },
  { userId: 'u-homeless', gymId: 'gym-a', role: 'MEMBER', deletedAt: null, locationId: null },
  {
    userId: 'u-closed',
    gymId: 'gym-a',
    role: 'MEMBER',
    deletedAt: null,
    locationId: 'loc-a-closed',
  },
];

const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

function client() {
  const locationFindFirst = vi.fn((args: Args) =>
    Promise.resolve(
      LOCATIONS.filter((l) => matches(l, args.where)).map((l) => ({ id: l.id }))[0] ?? null,
    ),
  );
  const memberFindFirst = vi.fn((args: Args) => {
    const row = MEMBERS.find((m) => matches(m, args.where));
    if (!row) return Promise.resolve(null);
    const location = LOCATIONS.find((l) => l.id === row.locationId);
    return Promise.resolve({
      locationId: row.locationId,
      location: location ? { status: location.status } : null,
    });
  });
  return {
    client: {
      location: { findFirst: locationFindFirst },
      gymMember: { findFirst: memberFindFirst },
    } as unknown as PrismaService['client'],
    locationFindFirst,
    memberFindFirst,
  };
}

describe('resolvePortalBranch', () => {
  it("narrows a signed-in member to their home branch in this gym, not another gym's", async () => {
    const { client: c, memberFindFirst } = client();

    await expect(resolvePortalBranch(c, { gymId: 'gym-a', userId: 'u-1' })).resolves.toBe('loc-a2');
    expect(memberFindFirst.mock.calls[0]![0].where).toMatchObject({
      userId: 'u-1',
      gymId: 'gym-a',
      role: 'MEMBER',
      deletedAt: null,
    });
  });

  it('shows an anonymous visitor every branch without reading anything', async () => {
    const { client: c, locationFindFirst, memberFindFirst } = client();

    await expect(resolvePortalBranch(c, { gymId: 'gym-a', userId: null })).resolves.toBe(undefined);
    expect(locationFindFirst).not.toHaveBeenCalled();
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it("rejects another gym's branch with the same 404 as an unknown one", async () => {
    const { client: c, locationFindFirst } = client();

    const foreign = await resolvePortalBranch(c, {
      gymId: 'gym-a',
      userId: 'u-1',
      locationId: 'loc-b1',
    }).catch((e: unknown) => e);
    const unknown = await resolvePortalBranch(c, {
      gymId: 'gym-a',
      locationId: 'nope',
    }).catch((e: unknown) => e);

    expect(foreign).toBeInstanceOf(NotFoundException);
    expect(unknown).toBeInstanceOf(NotFoundException);
    expect((foreign as NotFoundException).getResponse()).toEqual(
      (unknown as NotFoundException).getResponse(),
    );
    expect(locationFindFirst.mock.calls[0]![0].where).toMatchObject({
      id: 'loc-b1',
      gymId: 'gym-a',
      status: 'ACTIVE',
    });
  });

  it('rejects an inactive branch of the same gym', async () => {
    const { client: c } = client();

    await expect(
      resolvePortalBranch(c, { gymId: 'gym-a', locationId: 'loc-a-closed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("honours an override within the gym over the member's home branch", async () => {
    const { client: c, memberFindFirst } = client();

    await expect(
      resolvePortalBranch(c, { gymId: 'gym-a', userId: 'u-1', locationId: 'loc-a1' }),
    ).resolves.toBe('loc-a1');
    await expect(resolvePortalBranch(c, { gymId: 'gym-a', locationId: 'loc-a1' })).resolves.toBe(
      'loc-a1',
    );
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it('shows every branch to a member with no home branch, or a deactivated one', async () => {
    const { client: c } = client();

    await expect(resolvePortalBranch(c, { gymId: 'gym-a', userId: 'u-homeless' })).resolves.toBe(
      undefined,
    );
    await expect(resolvePortalBranch(c, { gymId: 'gym-a', userId: 'u-closed' })).resolves.toBe(
      undefined,
    );
  });

  it('shows every branch to a user with no member row in this gym (staff, or a stranger)', async () => {
    const { client: c } = client();

    await expect(resolvePortalBranch(c, { gymId: 'gym-a', userId: 'u-staff' })).resolves.toBe(
      undefined,
    );
  });
});

describe('PortalBranchService', () => {
  function setup(verify: (token: string) => VerifiedAccessClaims) {
    const { client: c, memberFindFirst } = client();
    const verifyAccessToken = vi.fn(verify);
    const service = new PortalBranchService(
      { client: c } as unknown as PrismaService,
      { verifyAccessToken } as unknown as TokenService,
    );
    return { service, verifyAccessToken, memberFindFirst };
  }

  it('reads the member from a bearer token scoped to the listed gym and returns their home branch', async () => {
    const { service, verifyAccessToken } = setup(() => ({ sub: 'u-1', gymId: 'gym-a' }));

    await expect(service.resolve({ gymId: 'gym-a', authorization: 'Bearer tok' })).resolves.toBe(
      'loc-a2',
    );
    expect(verifyAccessToken).toHaveBeenCalledWith('tok');
  });

  it('treats no header as anonymous', async () => {
    const { service, verifyAccessToken } = setup(() => ({ sub: 'u-1', gymId: 'gym-a' }));

    await expect(service.resolve({ gymId: 'gym-a' })).resolves.toBe(undefined);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('ignores a session scoped to another gym, even for a user who is also a member here', async () => {
    const { service, memberFindFirst } = setup(() => ({ sub: 'u-1', gymId: 'gym-b' }));

    await expect(service.resolve({ gymId: 'gym-a', authorization: 'Bearer tok' })).resolves.toBe(
      undefined,
    );
    expect(memberFindFirst).not.toHaveBeenCalled();
  });

  it('falls back to anonymous on a token that fails verification, instead of a 401', async () => {
    const { service } = setup(() => {
      throw new UnauthorizedException();
    });

    await expect(
      service.resolve({ gymId: 'gym-a', authorization: 'Bearer expired' }),
    ).resolves.toBe(undefined);
  });

  it("still rejects another gym's branch for a signed-in member", async () => {
    const { service } = setup(() => ({ sub: 'u-1', gymId: 'gym-a' }));

    await expect(
      service.resolve({ gymId: 'gym-a', authorization: 'Bearer tok', locationId: 'loc-b1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
