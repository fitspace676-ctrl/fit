'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { buttonClasses, Card, Icon } from '@/src/components/ui';
import { formatTime } from '@/src/components/classes/date-utils';
import { BookingHistoryCard } from './BookingHistoryCard';
import { relativeDayLabel } from './booking-format';

export interface BookingHistoryProps {
  entries: MemberBookingHistoryEntry[];
  /** Request-time boundary (ms since epoch) splitting upcoming from past. */
  now: number;
}

type View = 'upcoming' | 'past';

/**
 * The members' "My bookings" board, on the FormaCore design system. The member's
 * bookings split into Upcoming (start ≥ now, soonest first) and Past (most recent
 * first); a category filter narrows either tab and the soonest upcoming class is
 * surfaced as a gradient "Next up" hero. Booking actions (cancel / re-book) live
 * on each card.
 */
export function BookingHistory({ entries, now }: BookingHistoryProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const [view, setView] = useState<View>('upcoming');
  const [category, setCategory] = useState<string>('All');

  const { upcoming, past } = useMemo(() => splitByStart(entries, now), [entries, now]);

  const categories = useMemo(() => {
    const seen = new Set(entries.map((entry) => entry.classInstance.category).filter(Boolean));
    return ['All', ...[...seen].sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  if (entries.length === 0) {
    return (
      <Card className="grid place-items-center gap-2 px-6 py-14 text-center">
        <Icon name="calendar" className="h-9 w-9 text-ink-300 dark:text-ink-600" />
        <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
          {t('empty.title')}
        </h2>
        <p className="mx-auto max-w-sm text-sm text-ink-500 dark:text-ink-400">
          {t('empty.subtitle')}
        </p>
        <Link href="/classes" className={buttonClasses('primary', 'md', 'mt-3')}>
          {t('empty.action')}
        </Link>
      </Card>
    );
  }

  const inCategory = (entry: MemberBookingHistoryEntry) =>
    category === 'All' || entry.classInstance.category === category;
  const shown = (view === 'upcoming' ? upcoming : past).filter(inCategory);
  const nextUp = upcoming[0];

  return (
    <div className="flex flex-col gap-6">
      {nextUp ? <NextUpHero entry={nextUp} now={now} locale={locale} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-pill border border-ink-200 bg-white/70 p-1 backdrop-blur dark:border-white/10 dark:bg-white/[0.04]">
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
              className={`h-9 rounded-pill px-4 text-sm font-semibold transition ${
                view === tab.k
                  ? 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_6px_18px_-8px_rgba(98,87,227,0.8)]'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
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
              className={`h-9 shrink-0 rounded-pill px-3.5 text-xs font-semibold ring-1 ring-inset transition ${
                category === cat
                  ? 'bg-brand-50 text-brand-700 ring-brand-500/50 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-400/40'
                  : 'bg-white/70 text-ink-600 ring-ink-200 hover:bg-ink-50 dark:bg-white/[0.04] dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/10'
              }`}
            >
              {cat === 'All' ? t('filters.all') : cat}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-semibold text-ink-900 dark:text-white">
            {view === 'upcoming' ? t('noUpcoming') : t('noPast')}
          </p>
          {view === 'upcoming' ? (
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('noUpcomingHint')}</p>
          ) : null}
        </Card>
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

/** The soonest upcoming class, as a full-width brand-gradient banner. */
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
    <div className="relative overflow-hidden rounded-card bg-[linear-gradient(135deg,#7C3AED,#EC4899)] p-5 text-white shadow-[0_30px_70px_-24px_rgba(80,68,210,0.8)] sm:p-6">
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
          <h2 className="font-display text-2xl font-black tracking-tight">{instance.title}</h2>
          <p className="text-sm text-white/80">
            {[instance.trainerName, instance.locationName].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link
          href={`/classes/${instance.id}`}
          className="inline-flex h-11 items-center gap-2 rounded-btn bg-white px-5 text-sm font-bold text-ink-950 transition hover:bg-white/90"
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
