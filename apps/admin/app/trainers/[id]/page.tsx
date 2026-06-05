import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { TrainerActions } from './trainer-actions';

export const metadata: Metadata = {
  title: 'Trainer — Fit Admin',
};

// The detail reflects live trainer state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
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
        <Link href="/trainers" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to trainers
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_LABELS[trainer.status] ?? {
    label: trainer.status,
    className: 'bg-slate-100 text-slate-600',
  };

  // Write controls (edit + deactivate) are a `TrainerWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/trainers" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to trainers
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {trainer.photoUrl ? (
            <img
              src={trainer.photoUrl}
              alt={`${trainer.name} photo`}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-700">
              {initialsOf(trainer.name)}
            </span>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{trainer.name}</h1>
              <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
            </div>
            {trainer.headline ? <p className="text-sm text-slate-500">{trainer.headline}</p> : null}
          </div>
        </div>
        {canWrite ? <TrainerActions trainerId={trainer.id} status={trainer.status} /> : null}
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Specialties</h2>
        {trainer.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {trainer.specialties.map((tag) => (
              <span
                key={tag}
                className="rounded-card bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No specialties listed.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Bio</h2>
        {trainer.bio ? (
          <p className="max-w-2xl whitespace-pre-line text-sm text-slate-700">{trainer.bio}</p>
        ) : (
          <p className="text-sm text-slate-400">No bio yet.</p>
        )}
      </section>

      <p className="text-xs text-slate-400">Added {formatDate(trainer.createdAt)}.</p>
    </div>
  );
}
