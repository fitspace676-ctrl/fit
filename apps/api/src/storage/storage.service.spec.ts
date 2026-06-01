import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

// `vi.mock` factories are hoisted above the file, so the values they close over
// must come from `vi.hoisted` (also hoisted) rather than plain top-level consts.
//
// - mockEnv: a mutable stand-in for the frozen `env` singleton so each test can
//   flip R2 config on/off (the real `env` is parsed once at module load).
// - getSignedUrl: stubs the presigner so no network/credentials are needed; we
//   inspect the command it was handed to assert bucket/key/content-type.
const { mockEnv, getSignedUrl } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  // Typed signature so `.mock.calls` is a tuple, not `any[]` (keeps the
  // strict no-unsafe-* lint rules happy when we assert on the command).
  const getSignedUrl =
    vi.fn<
      (
        client: unknown,
        command: { input: Record<string, unknown> },
        options: { expiresIn: number },
      ) => Promise<string>
    >();
  return { mockEnv, getSignedUrl };
});
vi.mock('../config/env', () => ({ env: mockEnv }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl }));

import { StorageService } from './storage.service';

const FULL_CONFIG = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'access-key',
  R2_SECRET_ACCESS_KEY: 'secret-key',
  R2_BUCKET: 'fit-uploads',
  R2_PUBLIC_URL: 'https://cdn.example.com',
  R2_SIGNED_URL_TTL: 300,
  R2_MAX_UPLOAD_BYTES: 1_000_000,
};

/** A valid upload request; tests override individual fields. */
const VALID = {
  contentType: 'image/png',
  contentLength: 2048,
  gymId: 'gym-1',
  entity: 'avatars',
} as const;

function configure(overrides: Record<string, unknown> = {}): void {
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, FULL_CONFIG, overrides);
}

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    configure();
    getSignedUrl.mockReset().mockResolvedValue('https://signed.example/put');
    service = new StorageService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isConfigured', () => {
    it('is true when every credential is present', () => {
      expect(service.isConfigured).toBe(true);
    });

    it('is false when any credential is missing', () => {
      configure({ R2_BUCKET: undefined });
      expect(service.isConfigured).toBe(false);
    });
  });

  describe('createSignedUpload', () => {
    it('returns a signed PUT URL with a tenant-scoped key and the public URL', async () => {
      const result = await service.createSignedUpload(VALID);

      expect(result.method).toBe('PUT');
      expect(result.url).toBe('https://signed.example/put');
      expect(result.contentType).toBe('image/png');
      expect(result.contentLength).toBe(2048);
      expect(result.expiresIn).toBe(300);
      expect(result.key).toMatch(/^gym-1\/avatars\/[0-9a-f-]{36}\.png$/);
      expect(result.publicUrl).toBe(`https://cdn.example.com/${result.key}`);
    });

    it('passes bucket, key, content type, and content length to the PutObjectCommand', async () => {
      await service.createSignedUpload({
        ...VALID,
        contentType: 'application/pdf',
        entity: 'docs',
      });

      const [, command] = getSignedUrl.mock.calls[0]!;
      expect(command.input).toMatchObject({
        Bucket: 'fit-uploads',
        ContentType: 'application/pdf',
        ContentLength: 2048,
      });
      expect(command.input.Key).toMatch(/^gym-1\/docs\/[0-9a-f-]{36}\.pdf$/);
    });

    it('derives the extension from the filename when present', async () => {
      const result = await service.createSignedUpload({
        ...VALID,
        contentType: 'application/octet-stream',
        fileName: 'workout-plan.CSV',
      });

      expect(result.key).toMatch(/\.csv$/);
    });

    it('rejects an upload that exceeds the configured size limit with 400', async () => {
      await expect(
        service.createSignedUpload({ ...VALID, contentLength: 1_000_001 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects a non-positive content length', async () => {
      await expect(
        service.createSignedUpload({ ...VALID, contentLength: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a gymId that is not a safe slug (no namespace escape)', async () => {
      await expect(
        service.createSignedUpload({ ...VALID, gymId: '../etc' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(getSignedUrl).not.toHaveBeenCalled();
    });

    it('rejects an entity that is not lowercase letters', async () => {
      await expect(
        service.createSignedUpload({ ...VALID, entity: 'Avatars-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('clamps an over-long TTL to the SigV4 maximum (7 days)', async () => {
      const result = await service.createSignedUpload({ ...VALID, expiresIn: 99_999_999 });

      expect(result.expiresIn).toBe(604800);
      expect(getSignedUrl.mock.calls[0]![2]).toEqual({ expiresIn: 604800 });
    });

    it('reports a null public URL when R2_PUBLIC_URL is unset', async () => {
      configure({ R2_PUBLIC_URL: undefined });

      const result = await service.createSignedUpload(VALID);

      expect(result.publicUrl).toBeNull();
    });

    it('throws ServiceUnavailableException when R2 is not configured', async () => {
      configure({ R2_ACCESS_KEY_ID: undefined });

      await expect(service.createSignedUpload(VALID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('createSignedDownload', () => {
    it('signs a GET for the given key', async () => {
      getSignedUrl.mockResolvedValue('https://signed.example/get');

      const url = await service.createSignedDownload('gym-1/avatars/me.png', 60);

      expect(url).toBe('https://signed.example/get');
      const [, command, opts] = getSignedUrl.mock.calls[0]!;
      expect(command.input).toMatchObject({ Bucket: 'fit-uploads', Key: 'gym-1/avatars/me.png' });
      expect(opts).toEqual({ expiresIn: 60 });
    });
  });
});
