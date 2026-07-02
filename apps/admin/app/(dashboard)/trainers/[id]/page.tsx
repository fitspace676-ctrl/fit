import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission, type AdminTrainerDetail } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { Badge, Btn, Card, Dot, Icon, type IconName, type Tone } from '@/components/ui';
import { TrainerActions } from './trainer-actions';
import { TrainerTabs } from './trainer-tabs';

export const metadata: Metadata = {
  title: 'Trainer — Fit Admin',
};

// The detail reflects live trainer state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster cards' pills. */
const STATUS_LABELS: Record<string, { label: string; tone: Tone; dot: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', dot: 'bg-success-400' },
  INACTIVE: { label: 'On leave', tone: 'warning', dot: 'bg-warning-400' },
};

/** "Hired Mar 2025" from an ISO instant, or an em dash when absent/invalid. */
function formatHired(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : `Hired ${date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** One detail KPI card — toned icon, headline value, micro label, sub-context. */
function DetailKpi({
  label,
  value,
  context,
  icon,
  tone,
}: {
  label: string;
  value: string;
  context: string;
  icon: IconName;
  tone: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <Icon name={icon} className={`h-5 w-5 ${tone}`} />
      <p className="mt-3 font-display text-2xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="mt-0.5 text-[11px] text-ink-400 dark:text-ink-500">{context}</p>
    </Card>
  );
}

/**
 * The trainer detail page (T4.4), reskinned to the Planflow "formacore" layout:
 * a breadcrumb + Message action, a back link, an identity header card, four live
 * KPI cards, and the Overview/Schedule/Clients/Reviews/Availability tabs. Every
 * figure comes from the enriched `GET /admin/trainers/:id` (real tenant-scoped
 * queries). A `404` from the API — unknown or cross-tenant id — becomes Next's
 * `notFound()`; any other failure surfaces inline.
 */
export default async function TrainerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let trainer: AdminTrainerDetail;
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
    dot: 'bg-ink-400',
  };

  // Write controls (edit + deactivate) are a `TrainerWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <Link href="/trainers" className="hover:text-ink-600 dark:hover:text-ink-300">
            Trainers
          </Link>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{trainer.name}</span>
        </nav>
        <Btn v="primary" size="sm" icon="message" disabled>
          Message
        </Btn>
      </div>

      <Link
        href="/trainers"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 transition-colors hover:text-ink-900 dark:text-ink-400 dark:hover:text-white"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2.2} />
        Back to trainers
      </Link>

      {/* Identity header card. */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {trainer.photoUrl ? (
            <img
              src={trainer.photoUrl}
              alt={`${trainer.name} photo`}
              className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950"
            />
          ) : (
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-700 ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:bg-brand-500/15 dark:text-brand-200 dark:ring-offset-ink-950">
              {initialsOf(trainer.name)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white">
                {trainer.name}
              </h1>
              <Badge tone={status.tone}>
                <Dot c={status.dot} className="mr-1.5" />
                {status.label}
              </Badge>
              {trainer.headline || trainer.specialties[0] ? (
                <Badge tone="brand">{trainer.headline || trainer.specialties[0]}</Badge>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
              <span className="inline-flex items-center gap-1 text-warning-600 dark:text-warning-300">
                <Icon name="star" className="h-3.5 w-3.5" sw={1.8} />
                {trainer.rating.toFixed(1)} · {trainer.reviewCount}{' '}
                {trainer.reviewCount === 1 ? 'review' : 'reviews'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" className="h-3.5 w-3.5" sw={2} />
                {formatHired(trainer.hiredAt)}
              </span>
            </div>
          </div>
          {canWrite ? <TrainerActions trainerId={trainer.id} status={trainer.status} /> : null}
        </div>
      </Card>

      {/* Four live KPI cards. */}
      <section aria-label="Trainer metrics" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <DetailKpi
          label="Rating"
          value={trainer.rating.toFixed(1)}
          context={`${trainer.reviewCount} ${trainer.reviewCount === 1 ? 'review' : 'reviews'}`}
          icon="star"
          tone="text-warning-400"
        />
        <DetailKpi
          label="Classes / week"
          value={String(trainer.classesThisWeek)}
          context="this week"
          icon="calendar"
          tone="text-accent-400"
        />
        <DetailKpi
          label="Reviews"
          value={String(trainer.reviewCount)}
          context={`${trainer.thisWeek.newReviews} new this week`}
          icon="message"
          tone="text-iris-400"
        />
        <DetailKpi
          label="Show-up rate"
          value={trainer.showUpRate === null ? '—' : `${trainer.showUpRate}%`}
          context="last 90 days"
          icon="chart"
          tone="text-success-400"
        />
      </section>

      <TrainerTabs trainer={trainer} />
    </div>
  );
}
