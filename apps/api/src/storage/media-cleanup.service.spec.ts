import { describe, expect, it, vi } from 'vitest';
import { MediaCleanupService } from './media-cleanup.service';
import type { StorageService } from './storage.service';
import type { PrismaService } from '../prisma/prisma.service';

const BASE = 'https://pub-test.r2.dev';
const IMAGE = `${BASE}/gym-1/products/a.png`;
const OTHER = `${BASE}/gym-1/products/b.png`;

/** Counts each reference query returns; every source defaults to "not referenced". */
interface Counts {
  products?: number;
  trainers?: number;
  locations?: number;
  /** Gyms whose brand logo is this reference. */
  gyms?: number;
  /** Gyms whose member-portal sign-in photograph is this reference. */
  portalImages?: number;
  /** Gyms whose member-portal wordmark is this reference. */
  portalLogos?: number;
}

/** The `settings` JSON path a gym reference query filters on. */
interface GymCountArgs {
  where: { settings: { path: string[] } };
}

function setup(counts: Counts = {}) {
  const deleteObjects = vi.fn<(keys: readonly string[]) => Promise<number>>((keys) =>
    Promise.resolve(keys.length),
  );
  const storage = { deleteObjects } as unknown as StorageService;

  const prisma = {
    client: {
      product: { count: vi.fn(() => Promise.resolve(counts.products ?? 0)) },
      trainer: { count: vi.fn(() => Promise.resolve(counts.trainers ?? 0)) },
      location: { count: vi.fn(() => Promise.resolve(counts.locations ?? 0)) },
      // Three settings paths share this one model, so the stub answers by the
      // full path asked for rather than by call order — and by the WHOLE path,
      // not its first segment, since two of the three sit under `memberPortal`.
      gym: {
        count: vi.fn((args: GymCountArgs) => {
          const path = args.where.settings.path.join('.');
          if (path === 'memberPortal.loginImageUrl')
            return Promise.resolve(counts.portalImages ?? 0);
          if (path === 'memberPortal.logoUrl') return Promise.resolve(counts.portalLogos ?? 0);
          return Promise.resolve(counts.gyms ?? 0);
        }),
      },
    },
  } as unknown as PrismaService;

  return { service: new MediaCleanupService(prisma, storage), deleteObjects };
}

describe('MediaCleanupService.discardUnreferenced', () => {
  it('deletes the object behind a reference the edit dropped', async () => {
    const { service, deleteObjects } = setup();

    await service.discardUnreferenced([IMAGE, OTHER], [OTHER]);

    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/products/a.png']);
  });

  it('keeps an image another row still points at', async () => {
    const { service, deleteObjects } = setup({ products: 1 });

    await service.discardUnreferenced([IMAGE], []);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  // The portal photograph and the brand logo share the `logos` upload prefix, so
  // a gym that used one image as both would lose it the moment either side moved
  // on if only the logo were re-checked.
  it('keeps an image the member portal still points at', async () => {
    const { service, deleteObjects } = setup({ portalImages: 1 });

    await service.discardUnreferenced([`${BASE}/gym-1/logos/hero.jpg`], []);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  // The sharpest form of the shared-prefix case: a portal that inherits
  // `brand.logoUrl` holds ONE file under two settings paths, so replacing the
  // portal's wordmark must not delete the image invoices still print.
  it('keeps an image the portal wordmark still points at', async () => {
    const { service, deleteObjects } = setup({ portalLogos: 1 });

    await service.discardUnreferenced([`${BASE}/gym-1/logos/mark.webp`], []);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  it('does nothing when the reference is merely reordered', async () => {
    const { service, deleteObjects } = setup();

    await service.discardUnreferenced([IMAGE, OTHER], [OTHER, IMAGE]);

    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it('ignores null and blank column values', async () => {
    const { service, deleteObjects } = setup();

    await service.discardUnreferenced([null, '   ', undefined], [null]);

    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it('refuses to touch keys outside the upload prefixes', async () => {
    const { service, deleteObjects } = setup();

    await service.discardUnreferenced([`${BASE}/gym-1/invoices/2026/INV-001.pdf`], []);

    expect(deleteObjects).not.toHaveBeenCalled();
  });

  it('swallows storage failures so a committed edit still succeeds', async () => {
    const { service, deleteObjects } = setup();
    vi.mocked(deleteObjects).mockRejectedValueOnce(new Error('R2 unreachable'));

    await expect(service.discardUnreferenced([IMAGE], [])).resolves.toBeUndefined();
  });

  it('deletes a replaced photo once per key, even if listed twice', async () => {
    const { service, deleteObjects } = setup();

    await service.discardUnreferenced([IMAGE, IMAGE], []);

    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/products/a.png']);
  });
});
