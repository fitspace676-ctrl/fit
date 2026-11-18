import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { MePhotoController } from './me-photo.controller';
import type { MePhotoService } from './me-photo.service';

describe('MePhotoController', () => {
  it('rejects caller-supplied member and gym identifiers', () => {
    const createUpload = vi.fn();
    const setPhoto = vi.fn();
    const controller = new MePhotoController({
      createUpload,
      setPhoto,
    } as unknown as MePhotoService);
    expect(() =>
      controller.upload({ contentType: 'image/jpeg', contentLength: 100, gymId: 'other' }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.set({ photoUrl: 'https://images.example/photo.jpg', memberId: 'other' }),
    ).toThrow(BadRequestException);
    expect(createUpload).not.toHaveBeenCalled();
    expect(setPhoto).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, '100'])('rejects invalid byte counts: %s', (contentLength) => {
    const controller = new MePhotoController({} as MePhotoService);
    expect(() => controller.upload({ contentType: 'image/png', contentLength })).toThrow(
      BadRequestException,
    );
  });
});
