import { BadRequestException } from '@nestjs/common';
import { env } from '../config/env';
import { toObjectKey } from './media-key';

/** The `400` body's `code` when a payload names media outside the caller's gym. */
export const MEDIA_NOT_OWNED_CODE = 'MEDIA_NOT_OWNED';

/**
 * True when a stored media reference names an object under `{gymId}/…` — the
 * namespace `POST /uploads` mints for this gym. Blank values (`null`, `''`) are
 * "no image" and always pass, since every media column is optional.
 *
 * Ownership is read from the reference's object key (via {@link toObjectKey}),
 * never from its host: stored URLs outlive a move of `R2_PUBLIC_URL` to a custom
 * domain, and the cleanup paths already identify an object by path alone. A
 * reference with a `.` / `..` / empty segment is refused outright, so a bare key
 * cannot climb out of its own prefix.
 */
export function isOwnedMediaReference(value: string | null | undefined, gymId: string): boolean {
  if (value === null || value === undefined || value.trim() === '') return true;
  const key = toObjectKey(value);
  if (!key) return false;
  const segments = key.split('/');
  return (
    segments.length >= 2 &&
    segments[0] === gymId &&
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}

/**
 * True when a NEW reference would load from the public media host. Ownership
 * above is read from the path alone, so `https://evil.example/gym-1/a.png` passes
 * it; a browser renders that URL from the foreign host. A bare key has no host of
 * its own and passes, and with no public host configured (R2 off, local dev)
 * there is nothing to compare against. Compared on the parsed origin, so a host
 * that merely starts with the media host does not pass.
 */
function isOnPublicHost(reference: string | null | undefined, publicBase: string | undefined) {
  if (!publicBase || reference === null || reference === undefined || reference.trim() === '') {
    return true;
  }
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    return true;
  }
  try {
    return url.origin === new URL(publicBase).origin;
  } catch {
    return false;
  }
}

/**
 * Refuse a write that would point a gym's record at media it does not own — a
 * `400 MEDIA_NOT_OWNED`. The same rule the gym-logo and banner finalise routes
 * apply to a `photoKey`, extended to the forms that submit a public URL directly.
 *
 * `alreadyStored` is the record's current references: an unchanged value passes
 * untouched, so a row saved before this check existed can still be edited without
 * the admin first having to replace its picture. That is also what lets a stored
 * URL survive a move of `R2_PUBLIC_URL`: only a NEW reference must sit on the
 * current public host (`publicBase`, the configured one unless a test passes it).
 */
export function assertOwnedMedia(
  gymId: string,
  references: readonly (string | null | undefined)[],
  alreadyStored: readonly (string | null | undefined)[] = [],
  publicBase: string | undefined = env.R2_PUBLIC_URL,
): void {
  const stored = new Set(alreadyStored);
  const foreign = references.some(
    (reference) =>
      !stored.has(reference) &&
      (!isOwnedMediaReference(reference, gymId) || !isOnPublicHost(reference, publicBase)),
  );
  if (foreign) {
    throw new BadRequestException({
      code: MEDIA_NOT_OWNED_CODE,
      message: 'Media reference does not belong to this gym',
    });
  }
}
