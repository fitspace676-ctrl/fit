import { useLocale, useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry, MemberBookingStatus } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { formatDate, formatTime } from '@/src/components/classes/date-utils';

export interface BookingHistoryCardProps {
  entry: MemberBookingHistoryEntry;
}

/** Tailwind classes for each booking status pill — a calm palette that keeps the
 * active states (booked / waitlist) legible and dims the resolved / canceled
 * ones so the upcoming list reads at a glance. */
const STATUS_STYLES: Record<MemberBookingStatus, string> = {
  BOOKED: 'bg-emerald-50 text-emerald-700',
  WAITLIST: 'bg-amber-50 text-amber-700',
  ATTENDED: 'bg-brand-50 text-brand-700',
  NO_SHOW: 'bg-slate-100 text-slate-500',
  CANCELED: 'bg-slate-100 text-slate-500',
};

/**
 * One booking on the member panel's history list (T5.10): the occurrence it is
 * against — category, title (a deep link to the class detail page), schedule,
 * trainer / location — plus the booking's own status pill and, while waitlisted,
 * the queue position. A Server Component: the whole list is static, the class
 * title is the only interactive element.
 */
export function BookingHistoryCard({ entry }: BookingHistoryCardProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const { classInstance: instance, status } = entry;

  return (
    <li className="flex flex-col gap-3 rounded-card border border-slate-100 bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: instance.color }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {instance.category}
            </span>
          </div>
          <Link
            href={`/classes/${instance.id}`}
            className="text-base font-semibold text-slate-900 transition-colors hover:text-brand-600"
          >
            {instance.title}
          </Link>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
        >
          {status === 'WAITLIST' && entry.waitlistPosition !== null
            ? t('waitlistPosition', { position: entry.waitlistPosition })
            : t(`status.${status}`)}
        </span>
      </div>

      <dl className="flex flex-col gap-1 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <dt className="sr-only">{t('when')}</dt>
          <dd>
            {formatDate(instance.startsAt, locale)} · {formatTime(instance.startsAt, locale)} –{' '}
            {formatTime(instance.endsAt, locale)}
          </dd>
        </div>
        {instance.trainerName || instance.locationName ? (
          <div className="flex items-center gap-1.5 text-slate-500">
            <dt className="sr-only">{t('details')}</dt>
            <dd>{[instance.trainerName, instance.locationName].filter(Boolean).join(' · ')}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}
