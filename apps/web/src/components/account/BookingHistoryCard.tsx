'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry, MemberBookingStatus } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { Badge, buttonClasses, Card, type Tone } from '@/src/components/ui';
import { BookingActionButton } from '@/src/components/member/booking-action-button';
import { formatTime } from '@/src/components/classes/date-utils';
import { formatDuration, formatShortDate, relativeDayLabel } from './booking-format';

export interface BookingHistoryCardProps {
  entry: MemberBookingHistoryEntry;
  /** Request-time boundary (ms since epoch), used for the relative day label. */
  now: number;
  /** Whether this card sits in the "Past" tab — switches the action to re-book. */
  past?: boolean;
}

/** The badge tone for each booking status. */
const STATUS_TONE: Record<MemberBookingStatus, Tone> = {
  BOOKED: 'success',
  WAITLIST: 'warning',
  ATTENDED: 'brand',
  NO_SHOW: 'ink',
  CANCELED: 'ink',
};

/**
 * One booking on the member board, on the FormaCore design system: a glassy card
 * with a left time block (relative day · start · duration), the category chip,
 * the title (deep-linking to the class), the trainer/location/date row, the
 * status badge, and a primary action — Cancel for a live upcoming booking (runs
 * the cancel server action), Book again for a past one.
 */
export function BookingHistoryCard({ entry, now, past = false }: BookingHistoryCardProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const { classInstance: instance, status } = entry;
  const muted = past && (status === 'NO_SHOW' || status === 'CANCELED');
  const cancelable = !past && (status === 'BOOKED' || status === 'WAITLIST');

  return (
    <li>
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          {/* Time block */}
          <div className="w-16 shrink-0 rounded-card bg-ink-50 py-2 text-center ring-1 ring-inset ring-ink-100 dark:bg-white/5 dark:ring-white/10">
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {relativeDayLabel(instance.startsAt, now, locale, t)}
            </p>
            <p className="text-lg font-extrabold leading-tight tabular-nums text-ink-900 dark:text-white">
              {formatTime(instance.startsAt, locale)}
            </p>
            <p className="text-[10px] text-ink-400">
              {formatDuration(instance.startsAt, instance.endsAt)}
            </p>
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/classes/${instance.id}`}
                className={`font-display text-lg font-extrabold tracking-tight transition-colors hover:text-brand-600 dark:hover:text-brand-300 ${
                  muted ? 'text-ink-400' : 'text-ink-900 dark:text-white'
                }`}
              >
                {instance.title}
              </Link>
              {instance.category && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold ring-1 ring-inset"
                  style={{
                    color: instance.color,
                    backgroundColor: `${instance.color}1f`,
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
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500 dark:text-ink-400">
              {instance.trainerName ? <span>{instance.trainerName}</span> : null}
              {instance.locationName ? <span>{instance.locationName}</span> : null}
              <span>{formatShortDate(instance.startsAt, locale)}</span>
            </div>
          </div>

          {/* Status + action */}
          <div className="ml-auto flex items-center gap-2">
            <Badge tone={STATUS_TONE[status]}>
              {status === 'WAITLIST' && entry.waitlistPosition !== null
                ? t('waitlistPosition', { position: entry.waitlistPosition })
                : t(`status.${status}`)}
            </Badge>
            {cancelable ? (
              <BookingActionButton
                classId={instance.id}
                action="cancel"
                label={t('cancel')}
                v="outline"
                size="sm"
              />
            ) : past ? (
              <Link
                href={`/classes/${instance.id}`}
                className={buttonClasses('primary', 'sm')}
              >
                {t('bookAgain')}
              </Link>
            ) : (
              <Link href={`/classes/${instance.id}`} className={buttonClasses('outline', 'sm')}>
                {t('viewClass')}
              </Link>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
