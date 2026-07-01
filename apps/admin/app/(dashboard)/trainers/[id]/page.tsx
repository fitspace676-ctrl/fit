import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { Badge, Card, Icon, type Tone } from '@/components/ui';
import { TrainerActions } from './trainer-actions';

export const metadata: Metadata = {
  title: 'Trainer — Fit Admin',
};

// The detail reflects live trainer state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The trainer detail page (T4.4). Server-fetches `GET /admin/trainers/:id` and
 * renders the identity header (photo + name + status), the profile (headline,
 * specialties, bio), and the write controls for `TrainerWrite` staff. A `404` from
 * the API — unknown or cross-tenant id — becomes Next's `notFound()`; any other
 * failure surfaces inline.
 */
export default async function TrainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let trainer;
  try {
    trainer = await fetchTrainer(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this trainer (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/trainers"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          Back to trainers
        </Link>
        <Card className="flex items-start gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {message}
          </p>
        </Card>
      </div>
    );
  }

  const status = STATUS_LABELS[trainer.status] ?? {
    label: trainer.status,
    tone: 'ink' as const,
  };

  // Write controls (edit + deactivate) are a `TrainerWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  const labelClass = 'font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/trainers"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to trainers
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {trainer.photoUrl ? (
            <img
              src={trainer.photoUrl}
              alt={`${trainer.name} photo`}
              className="h-16 w-16 rounded-full object-cover ring-1 ring-ink-200 dark:ring-white/10"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
              {initialsOf(trainer.name)}
            </span>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
                {trainer.name}
              </h1>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            {trainer.headline ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">{trainer.headline}</p>
            ) : null}
          </div>
        </div>
        {canWrite ? <TrainerActions trainerId={trainer.id} status={trainer.status} /> : null}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className={labelClass}>Specialties</h2>
        {trainer.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {trainer.specialties.map((tag) => (
              <span
                key={tag}
                className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600 dark:bg-white/10 dark:text-ink-300"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No specialties listed.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={labelClass}>Bio</h2>
        {trainer.bio ? (
          <p className="max-w-2xl whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">
            {trainer.bio}
          </p>
        ) : (
          <p className="text-sm text-ink-400">No bio yet.</p>
        )}
      </section>

      <p className="text-xs text-ink-400">Added {formatDate(trainer.createdAt)}.</p>
    </div>
  );
}
