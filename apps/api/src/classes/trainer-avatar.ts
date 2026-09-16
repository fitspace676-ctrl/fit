/**
 * Narrow a trainer's stored `photoUrl` to the nullable URL the wire contracts
 * (`classInstanceCardSchema.trainerAvatarUrl`, `trainerCardSchema.avatarUrl`)
 * declare. The column is a free-text string — a legacy relative path or a
 * half-written value would fail the client's `z.string().url()` parse and sink
 * the whole listing, so anything that isn't an http(s) URL flattens to null and
 * the client renders its initials fallback instead.
 */
export function toAvatarUrl(photoUrl: string | null | undefined): string | null {
  return photoUrl && /^https?:\/\//.test(photoUrl) ? photoUrl : null;
}
