import { useLocale, useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry, MemberBookingStatus } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { formatTime } from '@/src/components/classes/date-utils';
import { formatDuration, formatShortDate, relativeDayLabel } from './booking-format';

export interface BookingHistoryCardProps {
  entry: MemberBookingHistoryEntry;
  /** Request-time boundary (ms since epoch), used for the relative day label. */
  now: number;
  /** Whether this card sits in the "Past" tab — switches the action to re-book. */
  past?: boolean;
}

/** Tailwind classes for each booking status pill — a calm, tinted palette that
 * keeps the active states (booked / waitlist) legible and dims the resolved /
 * canceled ones so the list reads at a glance. */
const STATUS_STYLES: Record<MemberBookingStatus, string> = {
  BOOKED: 'bg-emerald-50 text-emerald-700 ring-emerald-500/30',
  WAITLIST: 'bg-amber-50 text-amber-700 ring-amber-500/30',
  ATTENDED: 'bg-violet-50 text-violet-700 ring-violet-500/30',
  NO_SHOW: 'bg-slate-100 text-slate-500 ring-slate-300',
  CANCELED: 'bg-slate-100 text-slate-500 ring-slate-300',
};

/**
 * One booking on the member board's list (T5.10), restyled to the FormaCore
 * "Aurora Glass" light theme: a glassy white card with a left-hand time block
 * (relative day · start time · duration), the occurrence's category-coloured
 * chip, its title (a deep link to the class detail page), the trainer / location
 * / date detail row, the booking's status pill (with the waitlist position while
 * queued) and a primary action — "View class" for an upcoming booking, "Book
 * again" for a past one. A Server Component: the only interactive elements are
 * the two links.
 */
export function BookingHistoryCard({ entry, now, past = false }: BookingHistoryCardProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const { classInstance: instance, status } = entry;
  const muted = past && (status === 'NO_SHOW' || status === 'CANCELED');

  return (
    <li className="relative overflow-hidden rounded-card bg-white p-4 ring-1 ring-slate-200 shadow-[0_14px_40px_-18px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        {/* Time block */}
        <div className="w-16 shrink-0 rounded-card bg-slate-50 py-2 text-center ring-1 ring-inset ring-slate-200">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {relativeDayLabel(instance.startsAt, now, locale, t)}
          </p>
          <p className="text-lg font-extrabold leading-tight tabular-nums text-slate-900">
            {formatTime(instance.startsAt, locale)}
          </p>
          <p className="text-[10px] text-slate-400">
            {formatDuration(instance.startsAt, instance.endsAt)}
          </p>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/classes/${instance.id}`}
              className={`text-lg font-extrabold tracking-tight transition-colors hover:text-violet-600 ${
                muted ? 'text-slate-400' : 'text-slate-900'
              }`}
            >
              {instance.title}
            </Link>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset"
              style={{
                color: instance.color,
                backgroundColor: `${instance.color}14`,
                borderColor: `${instance.color}40`,
              }}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: instance.color }}
              />
              {instance.category}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {instance.trainerName ? <span>{instance.trainerName}</span> : null}
            {instance.locationName ? <span>{instance.locationName}</span> : null}
            <span>{formatShortDate(instance.startsAt, locale)}</span>
          </div>
        </div>

        {/* Status + action */}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
          >
            {status === 'WAITLIST' && entry.waitlistPosition !== null
              ? t('waitlistPosition', { position: entry.waitlistPosition })
              : t(`status.${status}`)}
          </span>
          {past ? (
            <Link
              href={`/classes/${instance.id}`}
              className="inline-flex h-9 items-center rounded-xl bg-[linear-gradient(135deg,#7c3aed,#ec4899)] px-3.5 text-sm font-bold text-white transition hover:brightness-110"
            >
              {t('bookAgain')}
            </Link>
          ) : (
            <Link
              href={`/classes/${instance.id}`}
              className="inline-flex h-9 items-center rounded-xl bg-slate-50 px-3.5 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100"
            >
              {t('viewClass')}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
