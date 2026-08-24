/**
 * Shared rules for turning a stored media reference into an object key, and for
 * deciding which keys the cleanup paths are allowed to delete.
 *
 * Both cleanup mechanisms depend on these: the nightly `MediaSweepService`
 * (reconciles the whole bucket) and `MediaCleanupService` (deletes the moment a
 * reference is dropped). They must agree — a key one of them treats as
 * off-limits must be off-limits for the other too.
 */

/**
 * The `{entity}` key segments a cleanup path may delete from — every prefix a
 * *user upload* lands under (`POST /uploads`, see `StorageService.buildKey`).
 *
 * Deliberately an allow-list, not a deny-list. Objects the API writes for itself —
 * `{gymId}/invoices/…` (invoice PDFs, legal documents) above all — live in the same
 * bucket, and so will whatever the next feature stores. An allow-list means a prefix
 * nobody taught the cleanup about is silently *kept*; a deny-list would mean it is
 * silently deleted. Adding an uploader means adding its entity here **and** its
 * column to `MediaSweepService.collectReferencedKeys`.
 */
export const SWEEPABLE_ENTITIES: ReadonlySet<string> = new Set([
  'products',
  'trainers',
  'locations',
  'logos',
  'classes',
]);

/**
 * Reduce a stored reference to the object key it names, or `null` when it is not a
 * usable reference. Accepts a bare key too (`gym/products/x.png`), so a column that
 * stores keys rather than public URLs still resolves.
 *
 * Keys are derived from the URL's *path*, never by stripping the configured
 * `R2_PUBLIC_URL` prefix: after a move to a custom domain the stored URLs still
 * carry the old host, and a prefix match would read every one of them as
 * unreferenced — that is, delete the entire library.
 */
export function toObjectKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  try {
    return decodeURIComponent(new URL(trimmed).pathname).replace(/^\/+/, '') || null;
  } catch {
    // Not an absolute URL — treat it as an already-bare key.
    return trimmed.replace(/^\/+/, '') || null;
  }
}

/** True when a key sits under `{gymId}/{entity}/…` for an entity cleanup owns. */
export function isSweepableKey(key: string): boolean {
  const segments = key.split('/');
  return segments.length > 2 && SWEEPABLE_ENTITIES.has(segments[1]!);
}
