import { useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { BookingHistoryCard } from './BookingHistoryCard';

export interface BookingHistoryProps {
  entries: MemberBookingHistoryEntry[];
  /** Request-time boundary (ms since epoch) splitting upcoming from past. Passed
   * in (not read here) so the Server Component stays a pure function of its
   * props — easy to test and free of a hidden `Date.now()`. */
  now: number;
}

/**
 * The member panel's "My bookings" body (T5.10): the signed-in member's bookings
 * split into **Upcoming** (occurrences that have not started, soonest first) and
 * **Past** (already started, most recent first). The split is by the occurrence's
 * start, not the booking status — a canceled booking for a future class still
 * sits under Upcoming with its "Canceled" pill, which reads more naturally than
 * burying it among finished classes. With no bookings at all the whole list
 * collapses to a single empty state pointing back at the schedule.
 */
export function BookingHistory({ entries, now }: BookingHistoryProps) {
  const t = useTranslations('account.bookings');

  const upcoming = entries
    .filter((entry) => new Date(entry.classInstance.startsAt).getTime() >= now)
    .sort(byStart('asc'));
  const past = entries
    .filter((entry) => new Date(entry.classInstance.startsAt).getTime() < now)
    .sort(byStart('desc'));

  if (entries.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
        <h2 className="text-base font-semibold text-slate-900">{t('empty.title')}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t('empty.subtitle')}</p>
        <Link
          href="/classes"
          className="mt-5 inline-flex items-center justify-center rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          {t('empty.action')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <BookingSection title={t('upcoming')} entries={upcoming} emptyText={t('noUpcoming')} />
      {past.length > 0 && <BookingSection title={t('past')} entries={past} />}
    </div>
  );
}

/** One titled list section. Renders its `emptyText` (when given) instead of an
 * empty `<ul>` so the Upcoming heading never sits above nothing. */
function BookingSection({
  title,
  entries,
  emptyText,
}: {
  title: string;
  entries: MemberBookingHistoryEntry[];
  emptyText?: string;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>
      {entries.length === 0 ? (
        emptyText ? (
          <p className="text-sm text-slate-500">{emptyText}</p>
        ) : null
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <BookingHistoryCard key={entry.bookingId} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Comparator on the occurrence start, in the given direction. */
function byStart(direction: 'asc' | 'desc') {
  const sign = direction === 'asc' ? 1 : -1;
  return (a: MemberBookingHistoryEntry, b: MemberBookingHistoryEntry): number =>
    sign *
    (new Date(a.classInstance.startsAt).getTime() - new Date(b.classInstance.startsAt).getTime());
}
