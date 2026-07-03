import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Permission, roleHasPermission, type AdminTrainerDetail } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchTrainer } from '@/lib/api';
import { Badge, Btn, Card, Icon, type IconName, type Tone } from '@/components/ui';
import { TrainerActions } from './trainer-actions';
import { TrainerTabs } from './trainer-tabs';

export const metadata: Metadata = {
  title: 'Trainer — Fit Admin',
};

// The detail reflects live trainer state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Tone treatment per status, matching the roster cards' pills. */
const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'success',
  INACTIVE: 'warning',
};

/** Translation key per status. */
const STATUS_LABEL_KEYS: Record<string, string> = {
  ACTIVE: 'status.active',
  INACTIVE: 'status.onLeave',
};

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "Hired March 2025" from an ISO instant, or an em dash when absent/invalid. */
function formatHired(
  iso: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
  locale: string,
): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : t('detail.hired', {
        date: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      });
}

/** Render a trainer's initials for the avatar placeholder. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** One detail KPI card — icon tile, headline value, label, and sub-context. */
function DetailKpi({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: IconName;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <span className="grid h-10 w-10 place-items-center rounded-btn bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-display text-3xl font-extrabold tabular-nums tracking-tight text-ink-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
        {label}
      </p>
      <p className="mt-2 text-xs tabular-nums text-ink-500 dark:text-ink-400">{context}</p>
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
  const t = await getTranslations('admin.trainers');
  const locale = await getLocale();

  let trainer: AdminTrainerDetail;
  try {
    trainer = await fetchTrainer(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? t('errors.loadTrainer', { status: error.status, message: error.message })
        : t('errors.unreachable');
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/trainers"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          {t('detail.backToTrainers')}
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

  const statusTone = STATUS_TONES[trainer.status] ?? ('ink' as const);
  const statusLabel = STATUS_LABEL_KEYS[trainer.status]
    ? t(STATUS_LABEL_KEYS[trainer.status]!)
    : trainer.status;

  // Write controls (edit + deactivate) are a `TrainerWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.TrainerWrite);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={t('list.breadcrumbAria')}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-400 dark:text-ink-500"
        >
          <span>Iron Gym</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <Link href="/trainers" className="hover:text-ink-600 dark:hover:text-ink-300">
            {t('list.breadcrumb')}
          </Link>
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
          <span className="text-ink-600 dark:text-ink-300">{trainer.name}</span>
        </nav>
        <Btn v="outline" size="sm" icon="message" disabled>
          {t('detail.message')}
        </Btn>
      </div>

      <Link
        href="/trainers"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        {t('detail.backToTrainers')}
      </Link>

      {/* Identity header card. */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          {trainer.photoUrl ? (
            <img
              src={trainer.photoUrl}
              alt={t('detail.photoAlt', { name: trainer.name })}
              className="h-16 w-16 rounded-full object-cover ring-1 ring-ink-200 dark:ring-white/10"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
              {initialsOf(trainer.name)}
            </span>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
                {trainer.name}
              </h1>
              <Badge tone={statusTone}>{statusLabel}</Badge>
              {trainer.specialties[0] ? <Badge tone="brand">{trainer.specialties[0]}</Badge> : null}
            </div>
            {trainer.headline ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">{trainer.headline}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 dark:text-ink-400">
              <span className="inline-flex items-center gap-1">
                <Icon name="star" className="h-3.5 w-3.5 text-amber-500" />
                <span className="font-semibold tabular-nums text-ink-700 dark:text-ink-200">
                  {trainer.rating.toFixed(1)}
                </span>
                · {t('reviews', { count: trainer.reviewCount })}
              </span>
              <span aria-hidden>·</span>
              <span>{formatHired(trainer.hiredAt, t, locale)}</span>
            </div>
          </div>
        </div>
        {canWrite ? <TrainerActions trainerId={trainer.id} status={trainer.status} /> : null}
      </Card>

      {/* Four live KPI cards. */}
      <section
        aria-label={t('detail.metricsAria')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <DetailKpi
          label={t('detail.kpiRating')}
          value={trainer.rating.toFixed(1)}
          context={t('reviews', { count: trainer.reviewCount })}
          icon="star"
        />
        <DetailKpi
          label={t('detail.kpiClassesPerWeek')}
          value={String(trainer.classesThisWeek)}
          context={t('detail.kpiClassesPerWeekContext')}
          icon="calendar"
        />
        <DetailKpi
          label={t('detail.kpiReviews')}
          value={String(trainer.reviewCount)}
          context={t('detail.kpiReviewsContext', { count: trainer.thisWeek.newReviews })}
          icon="message"
        />
        <DetailKpi
          label={t('detail.kpiShowUpRate')}
          value={trainer.showUpRate === null ? '—' : `${trainer.showUpRate}%`}
          context={t('detail.kpiShowUpRateContext')}
          icon="check"
        />
      </section>

      <TrainerTabs trainer={trainer} />

      <p className="text-xs text-ink-400">
        {t('detail.profileAdded', { date: formatDate(trainer.createdAt, locale) })}
      </p>
    </div>
  );
}
