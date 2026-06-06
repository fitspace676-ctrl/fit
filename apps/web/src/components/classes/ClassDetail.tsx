import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceDetail } from '@fit/types';
import { ClassBookingCta } from './ClassBookingCta';
import { formatDate, formatTime } from './date-utils';

export interface ClassDetailProps {
  instance: ClassInstanceDetail;
}

/**
 * The member-facing class detail page body (T5.9): one occurrence's full detail
 * on a deep-linkable `/classes/:id` URL — the schedule, trainer, location, and
 * live capacity, plus the auth-gated booking CTA.
 *
 * Reuses the calendar's pure date helpers so the detail page and the calendar
 * format times identically, and the same capacity-bar treatment as the calendar
 * drawer. Mostly a static Server Component; only the booking CTA
 * ({@link ClassBookingCta}) is a client island. When the occurrence is no longer
 * `SCHEDULED` (a shared link to a since-canceled / completed class) a banner
 * explains it and the booking CTA is withheld.
 */
export function ClassDetail({ instance }: ClassDetailProps) {
  const t = useTranslations('classes');
  const locale = useLocale();

  const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
  const isFull = spotsLeft === 0;
  const bookedPct =
    instance.capacity > 0 ? Math.min((instance.bookedCount / instance.capacity) * 100, 100) : 0;
  const isScheduled = instance.status === 'SCHEDULED';

  return (
    <article className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: instance.color }}
        />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {instance.category}
        </span>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">{instance.title}</h1>
        <p className="text-sm text-slate-500">{formatDate(instance.startsAt, locale)}</p>
      </header>

      {!isScheduled && (
        <p
          role="status"
          className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
        >
          {instance.status === 'CANCELED'
            ? t('detail.status.canceled')
            : t('detail.status.completed')}
        </p>
      )}

      {instance.description && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {instance.description}
        </p>
      )}

      <dl className="flex flex-col gap-3 border-y border-slate-100 py-5 text-sm">
        <DetailRow label={t('detail.time')}>
          {formatTime(instance.startsAt, locale)} – {formatTime(instance.endsAt, locale)}
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
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">{t('detail.capacity')}</span>
          <span className="tabular-nums text-slate-500">
            {instance.bookedCount} / {instance.capacity}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${isFull ? 'bg-red-400' : 'bg-brand-500'}`}
            style={{ width: `${bookedPct}%` }}
          />
        </div>
        <p className={`text-xs ${isFull ? 'text-red-600' : 'text-slate-500'}`}>
          {isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })}
        </p>
      </div>

      {isScheduled && (
        <div className="pt-1">
          <ClassBookingCta classId={instance.id} isFull={isFull} />
        </div>
      )}
    </article>
  );
}

/** A labelled detail line in the detail page's definition list. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}
