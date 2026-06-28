'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { formatTime } from '@/src/components/classes/date-utils';
import { BookingHistoryCard } from './BookingHistoryCard';
import { relativeDayLabel } from './booking-format';

export interface BookingHistoryProps {
  entries: MemberBookingHistoryEntry[];
  /** Request-time boundary (ms since epoch) splitting upcoming from past. Passed
   * in (not read here) so the page stays a pure function of its props — easy to
   * test and free of a hidden `Date.now()`. */
  now: number;
}

/** Brand purple → pink gradient, shared by the hero and the active tab pill. */
const BRAND_GRADIENT = 'bg-[linear-gradient(135deg,#7c3aed,#ec4899)]';

type View = 'upcoming' | 'past';

/** The members' "My bookings" board (T5.10), restyled to the FormaCore
 * "Aurora Glass" light theme. The signed-in member's bookings split into
 * **Upcoming** (not yet started, soonest first) and **Past** (already started,
 * most recent first). The split is by the occurrence's start, not the booking
 * status — a canceled booking for a future class still sits under Upcoming with
 * its "Canceled" pill, which reads more naturally than burying it among finished
 * classes. A category filter narrows either tab, and the soonest upcoming class
 * gets a "Next up" highlight. With no bookings at all the whole board collapses
 * to a single empty state pointing back at the schedule. */
export function BookingHistory({ entries, now }: BookingHistoryProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const [view, setView] = useState<View>('upcoming');
  const [category, setCategory] = useState<string>('All');

  const { upcoming, past } = useMemo(() => splitByStart(entries, now), [entries, now]);

  // Categories present across all bookings, "All" first — drives the filter pills.
  const categories = useMemo(() => {
    const seen = new Set(entries.map((entry) => entry.classInstance.category));
    return ['All', ...[...seen].sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center backdrop-blur">
        <h2 className="text-base font-semibold text-slate-900">{t('empty.title')}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t('empty.subtitle')}</p>
        <Link
          href="/classes"
          className={`mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_20px_-8px_rgba(124,58,237,0.8)] transition hover:brightness-110 ${BRAND_GRADIENT}`}
        >
          {t('empty.action')}
        </Link>
      </div>
    );
  }

  const inCategory = (entry: MemberBookingHistoryEntry) =>
    category === 'All' || entry.classInstance.category === category;
  const shown = (view === 'upcoming' ? upcoming : past).filter(inCategory);
  const nextUp = upcoming[0];

  return (
    <div className="flex flex-col gap-6">
      {nextUp ? <NextUpHero entry={nextUp} now={now} locale={locale} /> : null}

      {/* View tabs + category filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-full p-1 ring-1 ring-inset ring-slate-200 bg-white/70 backdrop-blur">
          {(
            [
              { k: 'upcoming', l: `${t('upcoming')} · ${upcoming.length}` },
              { k: 'past', l: t('past') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.k}
              type="button"
              onClick={() => setView(tab.k)}
              aria-pressed={view === tab.k}
              className={`h-9 rounded-full px-4 text-sm font-semibold transition ${
                view === tab.k
                  ? `text-white shadow-[0_6px_18px_-8px_rgba(124,58,237,0.8)] ${BRAND_GRADIENT}`
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.l}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto sm:ml-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`h-9 shrink-0 rounded-full px-3.5 text-xs font-semibold ring-1 ring-inset transition ${
                category === cat
                  ? 'bg-violet-50 text-violet-700 ring-violet-500/60'
                  : 'bg-white/70 text-slate-600 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat === 'All' ? t('filters.all') : cat}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {shown.length === 0 ? (
        <div className="rounded-card border border-slate-200 bg-white/70 py-12 text-center backdrop-blur">
          <p className="font-semibold text-slate-900">
            {view === 'upcoming' ? t('noUpcoming') : t('noPast')}
          </p>
          {view === 'upcoming' ? (
            <p className="mt-1 text-sm text-slate-500">{t('noUpcomingHint')}</p>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((entry) => (
            <BookingHistoryCard
              key={entry.bookingId}
              entry={entry}
              now={now}
              past={view === 'past'}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The soonest upcoming class, surfaced as a full-width brand-gradient banner. */
function NextUpHero({
  entry,
  now,
  locale,
}: {
  entry: MemberBookingHistoryEntry;
  now: number;
  locale: string;
}) {
  const t = useTranslations('account.bookings');
  const { classInstance: instance } = entry;
  const day = relativeDayLabel(instance.startsAt, now, locale, t);

  return (
    <div
      className={`relative overflow-hidden rounded-card p-5 text-white shadow-[0_30px_70px_-24px_rgba(124,58,237,0.8)] sm:p-6 ${BRAND_GRADIENT}`}
    >
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="w-16 shrink-0 rounded-card bg-white/20 py-2 text-center backdrop-blur">
          <p className="text-[10px] font-bold uppercase">{day}</p>
          <p className="text-lg font-extrabold leading-tight tabular-nums">
            {formatTime(instance.startsAt, locale)}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.12em] text-white/75">{t('nextUp')}</p>
          <h2 className="text-2xl font-black tracking-tight">{instance.title}</h2>
          <p className="text-sm text-white/80">
            {[instance.trainerName, instance.locationName].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link
          href={`/classes/${instance.id}`}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-slate-900 transition hover:bg-white/90"
        >
          {t('viewClass')}
        </Link>
      </div>
    </div>
  );
}

/** Split the history into upcoming (start ≥ now, soonest first) and past
 * (start < now, most recent first) by the occurrence's start. */
function splitByStart(entries: MemberBookingHistoryEntry[], now: number) {
  const start = (entry: MemberBookingHistoryEntry) =>
    new Date(entry.classInstance.startsAt).getTime();
  const upcoming = entries.filter((e) => start(e) >= now).sort((a, b) => start(a) - start(b));
  const past = entries.filter((e) => start(e) < now).sort((a, b) => start(b) - start(a));
  return { upcoming, past };
}
