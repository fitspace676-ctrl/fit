import type { BlogPostVisibility } from '@fit/types';
import type { BadgeTone } from '@fit/ui-kit';

/** How each derived visibility reads on a badge. */
export const VISIBILITY: Record<BlogPostVisibility, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'pending' },
  published: { label: 'Published', tone: 'positive' },
};

/** `2026-01-15 14:32` in the reader's own zone, or `—`. */
export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
