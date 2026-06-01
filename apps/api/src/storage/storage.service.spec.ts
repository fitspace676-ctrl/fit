import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';

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
  R2_SIGNED_URL_TTL: 900,
};

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
    it('returns a signed PUT URL with a uuid key and the public URL', async () => {
      const result = await service.createSignedUpload({
        contentType: 'image/png',
        prefix: 'avatars',
      });

      expect(result.method).toBe('PUT');
      expect(result.url).toBe('https://signed.example/put');
      expect(result.contentType).toBe('image/png');
      expect(result.expiresIn).toBe(900);
      expect(result.key).toMatch(/^avatars\/[0-9a-f-]{36}\.png$/);
      expect(result.publicUrl).toBe(`https://cdn.example.com/${result.key}`);
    });

    it('passes bucket, key, and content type to the PutObjectCommand', async () => {
      await service.createSignedUpload({ contentType: 'application/pdf' });

      const [, command] = getSignedUrl.mock.calls[0]!;
      expect(command.input).toMatchObject({
        Bucket: 'fit-uploads',
        ContentType: 'application/pdf',
      });
      expect(command.input.Key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    });

    it('derives the extension from the filename when present', async () => {
      const result = await service.createSignedUpload({
        contentType: 'application/octet-stream',
        fileName: 'workout-plan.CSV',
      });

      expect(result.key).toMatch(/\.csv$/);
    });

    it('sanitises a hostile prefix to prevent traversal', async () => {
      const result = await service.createSignedUpload({
        contentType: 'image/png',
        prefix: '../../etc//Secret Folder',
      });

      expect(result.key).not.toContain('..');
      expect(result.key).toMatch(/^etc\/secret-folder\/[0-9a-f-]{36}\.png$/);
    });

    it('clamps an over-long TTL to the SigV4 maximum (7 days)', async () => {
      const result = await service.createSignedUpload({
        contentType: 'image/png',
        expiresIn: 99_999_999,
      });

      expect(result.expiresIn).toBe(604800);
      expect(getSignedUrl.mock.calls[0]![2]).toEqual({ expiresIn: 604800 });
    });

    it('reports a null public URL when R2_PUBLIC_URL is unset', async () => {
      configure({ R2_PUBLIC_URL: undefined });

      const result = await service.createSignedUpload({ contentType: 'image/png' });

      expect(result.publicUrl).toBeNull();
    });

    it('throws ServiceUnavailableException when R2 is not configured', async () => {
      configure({ R2_ACCESS_KEY_ID: undefined });

      await expect(service.createSignedUpload({ contentType: 'image/png' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(getSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('createSignedDownload', () => {
    it('signs a GET for the given key', async () => {
      getSignedUrl.mockResolvedValue('https://signed.example/get');

      const url = await service.createSignedDownload('avatars/me.png', 60);

      expect(url).toBe('https://signed.example/get');
      const [, command, opts] = getSignedUrl.mock.calls[0]!;
      expect(command.input).toMatchObject({ Bucket: 'fit-uploads', Key: 'avatars/me.png' });
      expect(opts).toEqual({ expiresIn: 60 });
    });
  });
});
