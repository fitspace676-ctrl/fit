import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceDetail } from '@fit/types';
import { Badge, Card, Occupancy } from '@/src/components/ui';
import { ClassBookingCta } from './ClassBookingCta';
import { ClassOccupancyLive } from './ClassOccupancyLive';
import { formatDate, formatTime } from './date-utils';

export interface ClassDetailProps {
  instance: ClassInstanceDetail;
  /**
   * The gym in scope, used to open the live occupancy stream (T8.10). `null` on
   * the apex / preview URL, where the page renders without a live subscription.
   */
  gymId: string | null;
}

/**
 * The member-facing class detail page body (T5.9): one occurrence's full detail
 * on a deep-linkable `/classes/:id` URL — the schedule, trainer, location, and
 * live capacity, plus the auth-gated booking CTA.
 *
 * Reuses the calendar's pure date helpers so the detail page and the calendar
 * format times identically, and the same capacity treatment as the calendar
 * drawer. Mostly a static Server Component; only the booking CTA
 * ({@link ClassBookingCta}) is a client island. When the occurrence is no longer
 * `SCHEDULED` (a shared link to a since-canceled / completed class) a banner
 * explains it and the booking CTA is withheld.
 */
export function ClassDetail({ instance, gymId }: ClassDetailProps) {
  const t = useTranslations('classes');
  const locale = useLocale();

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const isScheduled = instance.status === 'SCHEDULED';

  return (
    <Card glow className="flex flex-col gap-6 p-6">
      {/* Accent colour bar from the class instance. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: instance.color }}
      />

      <div className="flex flex-col gap-3">
        <Badge tone="brand">{instance.category}</Badge>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white">
          {instance.title}
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          {formatDate(instance.startsAt, locale)}
        </p>
      </div>

      {!isScheduled && (
        <p
          role="status"
          className="rounded-btn border border-warning-300 bg-warning-50 px-4 py-3 text-sm font-medium text-warning-800 dark:border-warning-400/30 dark:bg-warning-400/10 dark:text-warning-100"
        >
          {instance.status === 'CANCELED'
            ? t('detail.status.canceled')
            : t('detail.status.completed')}
        </p>
      )}

      {instance.description && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          {instance.description}
        </p>
      )}

      <dl className="flex flex-col gap-3 border-y border-ink-200 py-5 text-sm dark:border-white/10">
        <DetailRow label={t('detail.time')}>
          <span className="font-mono tabular-nums">
            {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
          </span>
        </DetailRow>
        <DetailRow label={t('detail.duration')}>
          {t('detail.minutes', { count: instance.durationMinutes })}
        </DetailRow>
        {instance.trainerName ? (
          <DetailRow label={t('detail.trainer')}>{instance.trainerName}</DetailRow>
        ) : null}
        {instance.locationName ? (
          <DetailRow label={t('detail.location')}>{instance.locationName}</DetailRow>
        ) : null}
        {instance.room ? <DetailRow label={t('detail.room')}>{instance.room}</DetailRow> : null}
      </dl>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
          {t('detail.capacity')}
        </span>
        <Occupancy value={instance.bookedCount} cap={instance.capacity} />
        <p
          className={`text-xs ${
            isFull ? 'text-danger-600 dark:text-danger-300' : 'text-ink-500 dark:text-ink-400'
          }`}
        >
          {isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
        </p>
        {/* Headless island: refreshes this page when another member books / cancels
            / is promoted, pushed over SSE (T8.10). */}
        <ClassOccupancyLive
          gymId={gymId}
          instanceId={instance.id}
          bookedCount={instance.bookedCount}
          capacity={instance.capacity}
          status={instance.status}
        />
      </div>

      {isScheduled && (
        <div className="pt-1">
          <ClassBookingCta classId={instance.id} isFull={isFull} />
        </div>
      )}
    </Card>
  );
}

/** A labelled detail line in the detail page's definition list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-500 dark:text-ink-400">{label}</dt>
      <dd className="text-right font-medium text-ink-900 dark:text-white">{children}</dd>
    </div>
  );
}
