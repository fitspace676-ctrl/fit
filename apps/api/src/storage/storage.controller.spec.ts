import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService, type SignedUpload } from './storage.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const SIGNED: SignedUpload = {
  key: 'gym-1/avatars/abc.png',
  url: 'https://signed.example/put',
  method: 'PUT',
  contentType: 'image/png',
  contentLength: 2048,
  expiresIn: 300,
  publicUrl: 'https://cdn.example.com/gym-1/avatars/abc.png',
};

/** Controller backed by a StorageService stub (no real R2 client) and a fixed tenant. */
function controller(): { ctrl: StorageController; createSignedUpload: ReturnType<typeof vi.fn> } {
  const service = Object.create(StorageService.prototype) as StorageService;
  const createSignedUpload = vi.fn().mockResolvedValue(SIGNED);
  vi.spyOn(service, 'createSignedUpload').mockImplementation(createSignedUpload);
  // The gym comes from the session, not the body.
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  return { ctrl: new StorageController(service, tenant), createSignedUpload };
}

const BODY = {
  contentType: 'image/png',
  contentLength: 2048,
  entity: 'avatars',
  fileName: 'me.png',
} as const;

describe('StorageController', () => {
  it('signs an upload scoped to the caller’s own gym (from the session, not the body)', async () => {
    const { ctrl, createSignedUpload } = controller();

    // Even if a (now-ignored) gymId is supplied, the session's gym is used.
    const result = await ctrl.create({ ...BODY, gymId: 'attacker-gym' } as never);

    expect(result).toEqual(SIGNED);
    expect(createSignedUpload).toHaveBeenCalledWith({
      contentType: 'image/png',
      contentLength: 2048,
      gymId: 'gym-1',
      entity: 'avatars',
      fileName: 'me.png',
    });
  });

  it('trims strings, omits a blank fileName, and coerces a numeric string length', async () => {
    const { ctrl, createSignedUpload } = controller();

    await ctrl.create({
      contentType: '  image/png  ',
      contentLength: '2048',
      entity: 'avatars',
      fileName: '   ',
    });

    expect(createSignedUpload).toHaveBeenCalledWith({
      contentType: 'image/png',
      contentLength: 2048,
      gymId: 'gym-1',
      entity: 'avatars',
      fileName: undefined,
    });
  });

  it('rejects a missing contentType', async () => {
    const { ctrl } = controller();

    await expect(ctrl.create({ contentLength: 1, entity: 'a' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a missing or non-numeric contentLength', async () => {
    const { ctrl } = controller();

    await expect(ctrl.create({ contentType: 'image/png', entity: 'a' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      ctrl.create({ contentType: 'image/png', contentLength: 'huge', entity: 'a' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing entity', async () => {
    const { ctrl } = controller();

    await expect(
      ctrl.create({ contentType: 'image/png', contentLength: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-string optional fileName', async () => {
    const { ctrl } = controller();

    await expect(ctrl.create({ ...BODY, fileName: { evil: true } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
