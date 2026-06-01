import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StorageController } from './storage.controller';
import { StorageService, type SignedUpload } from './storage.service';

const SIGNED: SignedUpload = {
  key: 'avatars/abc.png',
  url: 'https://signed.example/put',
  method: 'PUT',
  contentType: 'image/png',
  expiresIn: 900,
  publicUrl: 'https://cdn.example.com/avatars/abc.png',
};

/** Controller backed by a StorageService stub (no real R2 client). */
function controller(): { ctrl: StorageController; createSignedUpload: ReturnType<typeof vi.fn> } {
  const service = Object.create(StorageService.prototype) as StorageService;
  const createSignedUpload = vi.fn().mockResolvedValue(SIGNED);
  vi.spyOn(service, 'createSignedUpload').mockImplementation(createSignedUpload);
  return { ctrl: new StorageController(service), createSignedUpload };
}

describe('StorageController', () => {
  it('returns the signed upload for a valid request', async () => {
    const { ctrl, createSignedUpload } = controller();

    const result = await ctrl.create({
      contentType: 'image/png',
      fileName: 'me.png',
      prefix: 'avatars',
    });

    expect(result).toEqual(SIGNED);
    expect(createSignedUpload).toHaveBeenCalledWith({
      contentType: 'image/png',
      fileName: 'me.png',
      prefix: 'avatars',
    });
  });

  it('trims and omits blank optional fields', async () => {
    const { ctrl, createSignedUpload } = controller();

    await ctrl.create({ contentType: '  image/png  ', fileName: '   ', prefix: '' });

    expect(createSignedUpload).toHaveBeenCalledWith({
      contentType: 'image/png',
      fileName: undefined,
      prefix: undefined,
    });
  });

  it('rejects a missing contentType', async () => {
    const { ctrl } = controller();

    await expect(ctrl.create({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-string contentType', async () => {
    const { ctrl } = controller();

    await expect(ctrl.create({ contentType: 123 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-string optional field', async () => {
    const { ctrl } = controller();

    await expect(
      ctrl.create({ contentType: 'image/png', prefix: { evil: true } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
