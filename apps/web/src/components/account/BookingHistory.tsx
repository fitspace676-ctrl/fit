'use client';

import { useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';
import { formatTime } from '@/src/components/classes/date-utils';
import { BookingHistoryCard } from './BookingHistoryCard';
import { relativeDayLabel } from './booking-format';

// Astryx migration (T11.14): the "My bookings" board is rebuilt on the Astryx
// design system over the Fit brand theme. Upcoming/past is an Astryx
// `SegmentedControl`; the category filter is a StyleX pill row; the soonest
// upcoming class is a lime-block "Next up" hero; the empty/no-match states
// use the Astryx `EmptyState` / `Card`. All layout is compiled StyleX
// (`var(--color-*)`), no Tailwind utilities. Split-by-start logic is unchanged.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  emptyIcon: {
    height: '2.25rem',
    width: '2.25rem',
    color: 'var(--color-text-secondary)',
  },
  controls: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'center',
    },
    gap: '0.75rem',
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    overflowX: 'auto',
    marginInlineStart: {
      default: null,
      '@media (min-width: 640px)': 'auto',
    },
  },
  pill: {
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.875rem',
    paddingBlock: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color',
    transitionDuration: '150ms',
  },
  pillIdle: {
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-tint-hover)',
    },
    color: 'var(--color-text-secondary)',
  },
  pillActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  noneCard: {
    paddingBlock: '3rem',
    textAlign: 'center',
  },
  noneTitle: {
    margin: 0,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  noneHint: {
    marginTop: '0.25rem',
    marginBottom: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // "Next up" hero — the second lime block in the portal, and the one that
  // carries the direction's signature move: the member's next class time set as
  // a giant mono numeral. Flat lime, ink type, no gradient/glow/coloured shadow
  // (see `membership-hero.tsx` for why the on-block colours are literals).
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-page)',
    backgroundColor: 'var(--color-accent)',
    padding: '1.5rem',
    color: '#131312',
  },
  heroRow: {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1.25rem',
  },
  // No tile, no fill behind it: at this size the numeral IS the graphic, and a
  // panel around it would only shrink it back to a label.
  heroTime: {
    flexShrink: 0,
    textAlign: 'left',
  },
  heroDay: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'rgba(19, 19, 18, 0.62)',
  },
  // NOTE — every `<p>` / heading on a lime block must state its colour.
  // The theme's reset carries `:where(p) { color: var(--color-text-primary) }`,
  // which in dark mode is white. It has zero specificity but it still beats
  // plain inheritance, so a paragraph inside the block does NOT pick up the
  // block's ink: it goes white on lime (~1.5:1) unless told otherwise.
  heroClock: {
    margin: 0,
    color: '#131312',
    fontFamily: 'var(--font-family-code)',
    fontSize: 'clamp(2.5rem, 6vw, 3.5rem)',
    fontWeight: 700,
    lineHeight: 0.9,
    letterSpacing: '-0.05em',
    fontVariantNumeric: 'tabular-nums',
  },
  heroBody: {
    minWidth: 0,
    flex: 1,
  },
  heroLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'rgba(19, 19, 18, 0.62)',
  },
  heroTitle: {
    margin: 0,
    marginTop: '0.25rem',
    color: '#131312',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 900,
    letterSpacing: '-0.02em',
  },
  heroMeta: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.875rem',
    color: 'rgba(19, 19, 18, 0.76)',
  },
  // The action inverts to ink — the block is already the lime, so the button
  // cannot be it too.
  heroAction: {
    backgroundColor: {
      default: '#131312',
      ':hover': '#2B2B29',
    },
    color: '#FFFFFF',
    borderColor: 'transparent',
  },
});

export interface BookingHistoryProps {
  entries: MemberBookingHistoryEntry[];
  /** Request-time boundary (ms since epoch) splitting upcoming from past. */
  now: number;
}

type View = 'upcoming' | 'past';

/**
 * The members' "My bookings" board, on the Astryx design system. The member's
 * bookings split into Upcoming (start ≥ now, soonest first) and Past (most recent
 * first); a category filter narrows either tab and the soonest upcoming class is
 * surfaced as a lime-block "Next up" hero. Booking actions (cancel / re-book) live
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
      <EmptyState
        icon={<Icon name="calendar" {...stylex.props(styles.emptyIcon)} />}
        title={t('empty.title')}
        description={t('empty.subtitle')}
        actions={
          <Button
            as={Link}
            href="/member/classes"
            variant="primary"
            size="md"
            label={t('empty.action')}
          />
        }
      />
    );
  }

  const inCategory = (entry: MemberBookingHistoryEntry) =>
    category === 'All' || entry.classInstance.category === category;
  const shown = (view === 'upcoming' ? upcoming : past).filter(inCategory);
  const nextUp = upcoming[0];

  return (
    <div {...stylex.props(styles.root)}>
      {nextUp ? <NextUpHero entry={nextUp} now={now} locale={locale} /> : null}

      <div {...stylex.props(styles.controls)}>
        <SegmentedControl value={view} onChange={(v) => setView(v as View)} label={t('title')}>
          <SegmentedControlItem value="upcoming" label={`${t('upcoming')} · ${upcoming.length}`} />
          <SegmentedControlItem value="past" label={t('past')} />
        </SegmentedControl>

        <div {...stylex.props(styles.filters)}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              {...stylex.props(styles.pill, category === cat ? styles.pillActive : styles.pillIdle)}
            >
              {cat === 'All' ? t('filters.all') : cat}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <Card variant="default" xstyle={styles.noneCard}>
          <p {...stylex.props(styles.noneTitle)}>
            {view === 'upcoming' ? t('noUpcoming') : t('noPast')}
          </p>
          {view === 'upcoming' ? (
            <p {...stylex.props(styles.noneHint)}>{t('noUpcomingHint')}</p>
          ) : null}
        </Card>
      ) : (
        <ul {...stylex.props(styles.list)}>
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
    <div {...stylex.props(styles.hero)}>
      <div {...stylex.props(styles.heroRow)}>
        <div {...stylex.props(styles.heroTime)}>
          <p {...stylex.props(styles.heroDay)}>{day}</p>
          <p {...stylex.props(styles.heroClock)}>{formatTime(instance.startsAt, locale)}</p>
        </div>
        <div {...stylex.props(styles.heroBody)}>
          <p {...stylex.props(styles.heroLabel)}>{t('nextUp')}</p>
          <h2 {...stylex.props(styles.heroTitle)}>{instance.title}</h2>
          <p {...stylex.props(styles.heroMeta)}>
            {[instance.trainerName, instance.locationName].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button
          as={Link}
          href={`/member/classes/${instance.id}`}
          variant="secondary"
          size="md"
          label={t('viewClass')}
          xstyle={styles.heroAction}
        />
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
