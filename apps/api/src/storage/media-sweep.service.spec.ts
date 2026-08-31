import { beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.mock` factories are hoisted, so the mutable env stand-in must come from
// `vi.hoisted` — the real `env` is frozen at module load and each test needs to
// flip the dry-run switch and the grace window.
const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { MediaSweepService } from './media-sweep.service';
import type { StoredObject, StorageService } from './storage.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

const NOW = new Date('2026-08-17T03:30:00.000Z');
/** Comfortably older than the 24h grace window. */
const OLD = new Date('2026-08-10T00:00:00.000Z');
/** Uploaded minutes ago — still inside the grace window. */
const FRESH = new Date('2026-08-17T03:00:00.000Z');

const PUBLIC_BASE = 'https://pub-test.r2.dev';

interface Rows {
  products?: { images: string[] }[];
  trainers?: { photoUrl: string | null }[];
  locations?: { photoUrl: string | null }[];
  classTemplates?: { imageUrl: string | null }[];
  services?: { coverUrl: string | null }[];
  gyms?: { settings: unknown }[];
}

/** Wire the service to fake storage + Prisma rows; returns the deletion spy. */
function setup(objects: StoredObject[], rows: Rows = {}) {
  const deleteObjects = vi.fn<(keys: readonly string[]) => Promise<number>>((keys) =>
    Promise.resolve(keys.length),
  );
  const storage = {
    isConfigured: true,
    listObjects: vi.fn(() => Promise.resolve(objects)),
    deleteObjects,
  } as unknown as StorageService;

  const prisma = {
    client: {
      product: { findMany: vi.fn(() => Promise.resolve(rows.products ?? [])) },
      trainer: { findMany: vi.fn(() => Promise.resolve(rows.trainers ?? [])) },
      location: { findMany: vi.fn(() => Promise.resolve(rows.locations ?? [])) },
      classTemplate: { findMany: vi.fn(() => Promise.resolve(rows.classTemplates ?? [])) },
      service: { findMany: vi.fn(() => Promise.resolve(rows.services ?? [])) },
      gym: { findMany: vi.fn(() => Promise.resolve(rows.gyms ?? [])) },
    },
  } as unknown as PrismaService;

  const redis = { client: { set: vi.fn() } } as unknown as RedisService;

  return { service: new MediaSweepService(prisma, redis, storage), deleteObjects };
}

/** An object listing entry. */
function object(key: string, lastModified: Date | null = OLD): StoredObject {
  return { key, lastModified, size: 1024 };
}

beforeEach(() => {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, { MEDIA_SWEEP_DRY_RUN: false, MEDIA_SWEEP_GRACE_HOURS: 24 });
});

describe('MediaSweepService.sweep', () => {
  it('deletes an unreferenced object older than the grace period', async () => {
    const { service, deleteObjects } = setup([object('gym-1/products/orphan.png')]);

    const summary = await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/products/orphan.png']);
    expect(summary).toMatchObject({ scanned: 1, orphaned: 1, deleted: 1, dryRun: false });
  });

  it('keeps objects a product gallery still points at', async () => {
    const { service, deleteObjects } = setup([object('gym-1/products/live.png')], {
      products: [{ images: [`${PUBLIC_BASE}/gym-1/products/live.png`] }],
    });

    const summary = await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
    expect(summary).toMatchObject({ referenced: 1, orphaned: 0, deleted: 0 });
  });

  it('owns the services prefix: keeps a referenced cover, deletes an orphaned one', async () => {
    const { service, deleteObjects } = setup(
      [object('gym-1/services/live.jpg'), object('gym-1/services/orphan.jpg')],
      { services: [{ coverUrl: `${PUBLIC_BASE}/gym-1/services/live.jpg` }] },
    );

    const summary = await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/services/orphan.jpg']);
    expect(summary).toMatchObject({ referenced: 1, orphaned: 1, deleted: 1 });
  });

  it('owns the classes prefix: keeps a referenced cover, deletes an orphaned one', async () => {
    const { service, deleteObjects } = setup(
      [object('gym-1/classes/live.jpg'), object('gym-1/classes/orphan.jpg')],
      { classTemplates: [{ imageUrl: `${PUBLIC_BASE}/gym-1/classes/live.jpg` }] },
    );

    const summary = await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/classes/orphan.jpg']);
    expect(summary).toMatchObject({ referenced: 1, orphaned: 1, deleted: 1 });
  });

  it('keeps the gym logo stored inside the settings JSON blob', async () => {
    const { service, deleteObjects } = setup([object('gym-1/logos/brand.png')], {
      gyms: [{ settings: { brand: { logoUrl: `${PUBLIC_BASE}/gym-1/logos/brand.png` } } }],
    });

    await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  // Under the same `logos` prefix as the brand logo, so a sweep that only knew
  // about `brand.logoUrl` would delete it out from under a live sign-in screen.
  it("keeps the member portal's sign-in photograph, also inside the settings blob", async () => {
    const { service, deleteObjects } = setup([object('gym-1/logos/hero.jpg')], {
      gyms: [
        { settings: { memberPortal: { loginImageUrl: `${PUBLIC_BASE}/gym-1/logos/hero.jpg` } } },
      ],
    });

    await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  // Also under `logos`, and the reference a gym's portal wears on every screen.
  // A sweep that did not know about it would delete a live tenant wordmark.
  it("keeps the member portal's wordmark, also inside the settings blob", async () => {
    const { service, deleteObjects } = setup([object('gym-1/logos/mark.webp')], {
      gyms: [{ settings: { memberPortal: { logoUrl: `${PUBLIC_BASE}/gym-1/logos/mark.webp` } } }],
    });

    await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  it('matches references by path, so a changed public host does not orphan the library', async () => {
    // The bucket moved to a custom domain but stored URLs still carry the old host.
    const { service, deleteObjects } = setup([object('gym-1/trainers/coach.jpg')], {
      trainers: [{ photoUrl: 'https://old-host.r2.dev/gym-1/trainers/coach.jpg' }],
    });

    await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  it('leaves a freshly uploaded object alone until its grace period expires', async () => {
    const { service, deleteObjects } = setup([object('gym-1/products/just-uploaded.png', FRESH)]);

    const summary = await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
    expect(summary).toMatchObject({ orphaned: 0, skippedInGrace: 1 });
  });

  it('keeps an object whose listing carried no modification time', async () => {
    const { service, deleteObjects } = setup([object('gym-1/products/undated.png', null)]);

    await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith([]);
  });

  it('never considers prefixes outside the allow-list, including invoice PDFs', async () => {
    const { service, deleteObjects } = setup([
      object('gym-1/invoices/2026/INV-001.pdf'),
      object('gym-1/exports/report.csv'),
      object('gym-1/products/orphan.png'),
    ]);

    const summary = await service.sweep(NOW);

    // Only the product image is even scanned; the other two are invisible to the sweep.
    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/products/orphan.png']);
    expect(summary.scanned).toBe(1);
  });

  it('reports orphans without deleting anything in dry run', async () => {
    mockEnv.MEDIA_SWEEP_DRY_RUN = true;
    const { service, deleteObjects } = setup([object('gym-1/products/orphan.png')]);

    const summary = await service.sweep(NOW);

    expect(deleteObjects).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ orphaned: 1, deleted: 0, dryRun: true });
  });

  it('sweeps the media of a gym whose rows are gone', async () => {
    const { service, deleteObjects } = setup([object('deleted-gym/logos/brand.png')], {
      gyms: [{ settings: { brand: { logoUrl: `${PUBLIC_BASE}/gym-1/logos/other.png` } } }],
    });

    await service.sweep(NOW);

    expect(deleteObjects).toHaveBeenCalledWith(['deleted-gym/logos/brand.png']);
  });

  it('tolerates rows with malformed or missing references', async () => {
    const { service, deleteObjects } = setup([object('gym-1/products/orphan.png')], {
      trainers: [{ photoUrl: null }, { photoUrl: '   ' }],
      gyms: [{ settings: null }, { settings: { brand: { logoUrl: 42 } } }],
    });

    const summary = await service.sweep(NOW);

    expect(summary.referenced).toBe(0);
    expect(deleteObjects).toHaveBeenCalledWith(['gym-1/products/orphan.png']);
  });
});
