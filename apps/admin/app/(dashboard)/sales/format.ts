// Shared formatting helper(s) used by the Sales tab's cards.

/** A `YYYY-MM-DD` bucket start as a locale short date. UTC in, UTC out. */
export function formatBucket(locale: string, bucket: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${bucket}T00:00:00.000Z`));
}
