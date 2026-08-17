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
  gyms?: number;
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
      gym: { count: vi.fn(() => Promise.resolve(counts.gyms ?? 0)) },
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
