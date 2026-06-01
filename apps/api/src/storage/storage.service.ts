import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

/** Parameters for minting a presigned upload URL. */
export interface SignedUploadRequest {
  /** MIME type the client will send (becomes the object's `Content-Type`). */
  contentType: string;
  /** Original filename — only its extension is used when deriving the key. */
  fileName?: string;
  /** Key prefix / folder, e.g. `avatars`. Sanitised before use. */
  prefix?: string;
  /** Override the signed-URL lifetime (seconds); defaults to `R2_SIGNED_URL_TTL`. */
  expiresIn?: number;
}

/** A presigned upload: PUT the file bytes to `url` with the given `contentType`. */
export interface SignedUpload {
  /** The object key within the bucket. */
  key: string;
  /** Presigned URL to `PUT` the object to. */
  url: string;
  /** HTTP method to use against `url`. */
  method: 'PUT';
  /** Required `Content-Type` header the upload must send to match the signature. */
  contentType: string;
  /** Seconds until the presigned URL expires. */
  expiresIn: number;
  /** Public URL the object will be reachable at, or `null` if `R2_PUBLIC_URL` is unset. */
  publicUrl: string | null;
}

/** Minimal MIME → extension map for common upload types lacking a filename. */
const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
};

/**
 * Signed-upload service for Cloudflare R2 (S3-compatible object storage).
 *
 * Clients never receive bucket credentials: they ask for a short-lived
 * presigned URL via {@link createSignedUpload} and `PUT` the bytes to R2
 * directly, keeping large transfers off the API process. {@link createSignedDownload}
 * mints the equivalent for reading private objects.
 *
 * R2 config is optional (see `config/env.ts`); when any credential is missing
 * the service reports {@link isConfigured} `false` and every signing call
 * throws {@link ServiceUnavailableException}, so the API still boots without R2.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private cachedClient: S3Client | null = null;

  /** True when every R2 credential is present and signing can proceed. */
  get isConfigured(): boolean {
    return Boolean(
      env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
    );
  }

  /** Mint a presigned `PUT` URL the client uploads a single object to. */
  async createSignedUpload(request: SignedUploadRequest): Promise<SignedUpload> {
    const bucket = this.requireBucket();
    const contentType = request.contentType.trim();
    const key = this.buildKey(contentType, request.fileName, request.prefix);
    const expiresIn = this.resolveTtl(request.expiresIn);

    const url = await getSignedUrl(
      this.client(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );

    this.logger.debug(`Signed upload URL for ${key} (expires in ${expiresIn}s)`);

    return {
      key,
      url,
      method: 'PUT',
      contentType,
      expiresIn,
      publicUrl: this.publicUrl(key),
    };
  }

  /** Mint a presigned `GET` URL for reading a private object by key. */
  async createSignedDownload(key: string, expiresIn?: number): Promise<string> {
    const bucket = this.requireBucket();
    return getSignedUrl(this.client(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: this.resolveTtl(expiresIn),
    });
  }

  /** Public URL for an object, or `null` when no public base URL is configured. */
  publicUrl(key: string): string | null {
    if (!env.R2_PUBLIC_URL) return null;
    return `${env.R2_PUBLIC_URL.replace(/\/+$/, '')}/${key}`;
  }

  onModuleDestroy(): void {
    this.cachedClient?.destroy();
    this.cachedClient = null;
  }

  /**
   * Lazily build (and memoise) the S3 client pointed at the R2 endpoint.
   * `region: 'auto'` is required by R2; the endpoint is derived from the
   * account id.
   */
  private client(): S3Client {
    if (this.cachedClient) return this.cachedClient;

    this.cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
    return this.cachedClient;
  }

  private requireBucket(): string {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Object storage (R2) is not configured');
    }
    return env.R2_BUCKET!;
  }

  private resolveTtl(expiresIn?: number): number {
    if (expiresIn === undefined) return env.R2_SIGNED_URL_TTL;
    // S3 SigV4 caps presigned URL lifetime at 7 days.
    return Math.min(Math.max(1, Math.floor(expiresIn)), 604800);
  }

  /**
   * Derive a collision-resistant object key: `<prefix>/<uuid><ext>`. The
   * extension comes from the filename when present, otherwise the MIME type;
   * the prefix is sanitised to a safe slug so callers can't escape the bucket
   * namespace.
   */
  private buildKey(contentType: string, fileName?: string, prefix?: string): string {
    const ext = this.extensionFor(contentType, fileName);
    const name = `${randomUUID()}${ext}`;
    const folder = this.sanitisePrefix(prefix);
    return folder ? `${folder}/${name}` : name;
  }

  private extensionFor(contentType: string, fileName?: string): string {
    const fromName = fileName ? extname(fileName).toLowerCase() : '';
    if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
    return MIME_EXTENSIONS[contentType.toLowerCase()] ?? '';
  }

  private sanitisePrefix(prefix?: string): string {
    if (!prefix) return '';
    return (
      prefix
        .toLowerCase()
        .split('/')
        .map((segment) => segment.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))
        // Drop empties and `.`/`..` (which collapse to '' above) — no traversal,
        // no leading/duplicate slashes survive.
        .filter(Boolean)
        .join('/')
        .slice(0, 128)
    );
  }
}
