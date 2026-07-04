import {
  BadRequestException,
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

/** Tenant id segment: lowercase alphanumerics + dashes (matches a gym slug/id). */
const GYM_ID_PATTERN = /^[a-z0-9-]+$/;
/** Entity segment: lowercase letters only (e.g. `avatars`, `products`, `logos`). */
const ENTITY_PATTERN = /^[a-z]+$/;

/** Parameters for minting a presigned upload URL. */
export interface SignedUploadRequest {
  /** MIME type the client will send (becomes the object's `Content-Type`). */
  contentType: string;
  /**
   * Exact size (bytes) the client will upload. Rejected with 400 when it
   * exceeds `R2_MAX_UPLOAD_BYTES`, and bound into the signature so the upload
   * can't deviate from it.
   */
  contentLength: number;
  /** Owning tenant — the first, isolating key segment. Must match `^[a-z0-9-]+$`. */
  gymId: string;
  /** Entity type — the second key segment (e.g. `avatars`). Must match `^[a-z]+$`. */
  entity: string;
  /** Original filename — only its extension is used when deriving the key. */
  fileName?: string;
  /** Override the signed-URL lifetime (seconds); defaults to `R2_SIGNED_URL_TTL`. */
  expiresIn?: number;
}

/** A presigned upload: PUT the file bytes to `url` with the given headers. */
export interface SignedUpload {
  /** The object key within the bucket (`{gymId}/{entity}/{uuid}{ext}`). */
  key: string;
  /** Presigned URL to `PUT` the object to. */
  url: string;
  /** HTTP method to use against `url`. */
  method: 'PUT';
  /** Required `Content-Type` header the upload must send to match the signature. */
  contentType: string;
  /** Required `Content-Length` header the upload must send to match the signature. */
  contentLength: number;
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
    const contentLength = this.requireSize(request.contentLength);
    const key = this.buildKey(request.gymId, request.entity, contentType, request.fileName);
    const expiresIn = this.resolveTtl(request.expiresIn);

    // Signing `ContentLength` binds the URL to this exact size: R2 rejects a PUT
    // whose `Content-Length` header differs, so an oversized upload can't slip
    // past the 400 check above by lying about its size up front.
    const url = await getSignedUrl(
      this.client(),
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn },
    );

    this.logger.debug(`Signed upload URL for ${key} (${contentLength}B, expires in ${expiresIn}s)`);

    return {
      key,
      url,
      method: 'PUT',
      contentType,
      contentLength,
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

  /**
   * Upload `body` to `key` from the API process itself (not a presigned client PUT).
   * Used for server-rendered documents — the invoice PDF (T5.10) — where the bytes
   * are produced on the server and must land in R2 before we hand back a download.
   * Callers pass an already-namespaced key (`{gymId}/…`); no size signing applies.
   */
  async putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    const bucket = this.requireBucket();
    await this.client().send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    this.logger.debug(`Stored ${key} (${body.byteLength}B, ${contentType})`);
  }

  /**
   * Read a private object's bytes into a Buffer, or `null` when it does not exist
   * (a `NoSuchKey` / 404). Buffers the whole object — sized for small documents like
   * the invoice PDF, not large media. Every other S3 error propagates.
   */
  async getObject(key: string): Promise<Buffer | null> {
    const bucket = this.requireBucket();
    try {
      const result = await this.client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw error;
    }
  }

  /** True when an S3 error means the object simply is not there (vs. a real fault). */
  private isNotFound(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
      ?.httpStatusCode;
    return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
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

  /** Validate the declared upload size against the configured ceiling. */
  private requireSize(contentLength: number): number {
    if (!Number.isInteger(contentLength) || contentLength <= 0) {
      throw new BadRequestException('contentLength must be a positive integer (bytes)');
    }
    if (contentLength > env.R2_MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds the ${env.R2_MAX_UPLOAD_BYTES}-byte upload limit`,
      );
    }
    return contentLength;
  }

  /**
   * Derive a tenant-scoped, collision-resistant object key
   * `{gymId}/{entity}/{uuid}{ext}`. Every object is prefixed by its owning
   * `gymId`, so keys from different tenants can never collide. Segments are
   * validated (not sanitised) so a caller can't escape the namespace or smuggle
   * a different shape past the convention. The extension comes from the filename
   * when present, otherwise the MIME type.
   */
  private buildKey(gymId: string, entity: string, contentType: string, fileName?: string): string {
    const tenant = this.requireSegment(gymId, GYM_ID_PATTERN, 'gymId');
    const kind = this.requireSegment(entity, ENTITY_PATTERN, 'entity');
    const ext = this.extensionFor(contentType, fileName);
    return `${tenant}/${kind}/${randomUUID()}${ext}`;
  }

  private requireSegment(value: string, pattern: RegExp, field: string): string {
    const trimmed = value.trim();
    if (!pattern.test(trimmed)) {
      throw new BadRequestException(`${field} must match ${pattern.source}`);
    }
    return trimmed;
  }

  private extensionFor(contentType: string, fileName?: string): string {
    const fromName = fileName ? extname(fileName).toLowerCase() : '';
    if (/^\.[a-z0-9]{1,8}$/.test(fromName)) return fromName;
    return MIME_EXTENSIONS[contentType.toLowerCase()] ?? '';
  }
}
