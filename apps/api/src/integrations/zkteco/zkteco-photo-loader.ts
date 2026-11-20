import { Injectable } from '@nestjs/common';
import { env } from '../../config/env';

/** Face readers want a small JPEG; anything larger is skipped, not resized. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5_000;

/**
 * Reads a member's profile photo for ZKBio face readers, as base64. Only our own
 * public storage is read (`R2_PUBLIC_URL`): a stored URL anywhere else is
 * ignored, so a crafted URL can never make the API fetch an arbitrary address.
 * Any failure is `null`; the member is still synced, without a face.
 */
@Injectable()
export class ZktecoPhotoLoader {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async load(
    url: string,
    publicBase: string | undefined = env.R2_PUBLIC_URL,
  ): Promise<string | null> {
    if (!publicBase || !isUnder(url, publicBase)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetcher(url, { signal: controller.signal, redirect: 'error' });
      if (!response.ok) return null;
      const length = Number(response.headers.get('content-length') ?? '0');
      if (length > MAX_PHOTO_BYTES) return null;
      const type = response.headers.get('content-type') ?? '';
      if (!/^image\/(jpeg|jpg|png)$/i.test(type.split(';')[0]!.trim())) return null;
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length === 0 || body.length > MAX_PHOTO_BYTES) return null;
      return body.toString('base64');
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function isUnder(url: string, base: string): boolean {
  try {
    const target = new URL(url);
    const root = new URL(base.endsWith('/') ? base : `${base}/`);
    return (
      target.protocol === 'https:' &&
      target.origin === root.origin &&
      target.pathname.startsWith(root.pathname)
    );
  } catch {
    return false;
  }
}
