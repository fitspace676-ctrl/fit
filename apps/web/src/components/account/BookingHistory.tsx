'use client';

import { useMemo, useState } from 'react';
import {
  ButtonLink,
  Card,
  CountUp,
  EmptyState,
  FilterChips,
  SegmentedControl,
} from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { IconName } from '@/src/components/ui';
import type { MemberBookingHistoryEntry } from '@fit/types';
import { Icon } from '@/src/components/ui';
import { formatZonedTime } from '@/src/components/classes/date-utils';
import { BookingHistoryCard } from './BookingHistoryCard';
import { formatDuration, relativeDayLabel } from './booking-format';

// Astryx migration (T11), now on the portal kit: the "My bookings" board is rebuilt on the portal kit
// design system over the FormaCore theme. Upcoming/past is an Astryx
// `SegmentedControl`; the soonest upcoming class is a lime-block "Next up" hero;
// the empty/no-match states use the kit's `EmptyState` / `Card`. All layout is
// compiled StyleX (`var(--color-*)`), no Tailwind utilities. Split-by-start
// logic is unchanged.
//
// WIDE LAYOUT PASS. The board used to be a single 48rem column of full-width
// rows inside an 1180px shell, so a laptop showed a third of the canvas empty
// and a phone showed the same thing it always did — the screen got no benefit
// from any width it was given. Three changes spend it:
//
//   1. A four-tile counter strip states the board's shape (upcoming, attended,
//      waitlisted, total) before any row is read. It is the dashboard's stat
//      strip at the same scale, so the two screens read as one system.
//   2. The cards run as a two-column grid from `lg`. A booking card is a dense
//      horizontal row; stretched to 1180px it becomes a 64px chip, a title, and
//      a button separated by a void. Two per row keeps it dense and doubles what
//      fits above the fold.
//   3. The category filter is now the kit's `FilterChips` rather than a private
//      row of outlined pills. It carries per-category counts, and — the point —
//      it is the same capsule silhouette as the segmented control beside it.
//      The hand-rolled pills were a different height, radius and border, so the
//      one control row on the screen was drawn in two vocabularies.

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
  /* ------------------------------ stat strip ------------------------------ */
  // Two-up on a phone, four-up from `sm`. Never a single column: these are
  // counters, and a column of four one-number cards reads as a list of settings.
  stats: {
    display: 'grid',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 640px)': 'repeat(4, minmax(0, 1fr))',
    },
    gap: '0.75rem',
  },
  statCard: {
    padding: '1.25rem',
  },
  statIcon: {
    height: '1.25rem',
    width: '1.25rem',
    color: 'var(--color-text-accent)',
  },
  // The direction's signature move at tile scale — a cropped mono numeral doing
  // the work an icon would do elsewhere. Same ramp as the dashboard's strip.
  statValue: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: {
      default: '1.75rem',
      '@media (min-width: 640px)': '2rem',
    },
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  statLabel: {
    margin: 0,
    marginTop: '0.75rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: {
      default: 'normal',
      '@media (min-width: 640px)': '0.14em',
    },
    color: 'var(--color-text-secondary)',
  },
  /* ------------------------------- controls ------------------------------- */
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  // Pushed to the far end of the row on a desktop, stacked under the tabs on a
  // phone — where `marginInlineStart: auto` would strand it against the edge of
  // a wrapped line.
  filters: {
    maxWidth: '100%',
    overflowX: 'auto',
    marginInlineStart: {
      default: null,
      '@media (min-width: 640px)': 'auto',
    },
  },
  /* --------------------------------- list --------------------------------- */
  list: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(2, minmax(0, 1fr))',
    },
    alignItems: 'start',
    gap: '0.75rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  /* ----------------------------- "Next up" hero ---------------------------- */
  // The second lime block in the portal, and the one that carries the
  // direction's signature move: the member's next class time set as a giant mono
  // numeral. Flat lime, ink type, no gradient/glow/coloured shadow (see
  // `membership-hero.tsx` for why the on-block colours are literals).
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 'var(--radius-page)',
    backgroundColor: 'var(--color-accent)',
    padding: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.75rem 2rem',
    },
    color: '#131312',
  },
  heroRow: {
    position: 'relative',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: {
      default: '1.25rem',
      '@media (min-width: 640px)': '2rem',
    },
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
    fontSize: 'clamp(2.5rem, 6vw, 3.75rem)',
    fontWeight: 700,
    lineHeight: 0.9,
    letterSpacing: '-0.05em',
    fontVariantNumeric: 'tabular-nums',
  },
  heroDuration: {
    margin: 0,
    marginTop: '0.375rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'rgba(19, 19, 18, 0.62)',
  },
  // A hairline between the numeral and the class it belongs to. Ink at 18%, not
  // a border token: the block is lime, and every theme border reads as a smudge
  // on it. Hidden while the row is stacked, where a vertical rule has nothing to
  // separate.
  heroRule: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'block',
    },
    alignSelf: 'stretch',
    width: '1px',
    flexShrink: 0,
    backgroundColor: 'rgba(19, 19, 18, 0.18)',
  },
  heroBody: {
    minWidth: '14rem',
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
    fontSize: 'clamp(1.5rem, 3vw, 1.875rem)',
    fontWeight: 900,
    letterSpacing: '-0.02em',
  },
  heroMeta: {
    margin: 0,
    marginTop: '0.25rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '1rem',
    rowGap: '0.25rem',
    fontSize: '0.875rem',
    color: 'rgba(19, 19, 18, 0.76)',
  },
  heroMetaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  heroMetaIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
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
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

type View = 'upcoming' | 'past';

/** The "all categories" chip. `FilterChips` reserves the empty string for it. */
const ALL = '';

/**
 * The members' "My bookings" board, on the portal kit. The member's bookings
 * split into Upcoming (start ≥ now, soonest first) and Past (most recent
 * first), over a counter strip that states the board's shape; a category filter
 * narrows either tab and the soonest upcoming class is surfaced as a lime-block
 * "Next up" hero. Booking actions (cancel / re-book) live on each card.
 */
export function BookingHistory({ entries, now, timeZone }: BookingHistoryProps) {
  const t = useTranslations('account.bookings');
  const locale = useLocale();
  const [view, setView] = useState<View>('upcoming');
  const [category, setCategory] = useState<string>(ALL);

  const { upcoming, past } = useMemo(() => splitByStart(entries, now), [entries, now]);

  // The visible half, before the category filter — the chips count within it, so
  // "Yoga · 2" means two Yoga rows in the tab you are actually looking at.
  const inView = view === 'upcoming' ? upcoming : past;

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of inView) {
      const name = entry.classInstance.category;
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [
      { value: ALL, label: t('filters.all'), count: inView.length },
      ...[...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({ value: name, label: name, count })),
    ];
  }, [inView, t]);

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Icon name="calendar" {...stylex.props(styles.emptyIcon)} />}
          title={t('empty.title')}
          body={t('empty.subtitle')}
          action={
            <ButtonLink
              href="/member/classes"
              variant="primary"
              size="card"
              label={t('empty.action')}
            />
          }
        />
      </Card>
    );
  }

  const shown = inView.filter(
    (entry) => category === ALL || entry.classInstance.category === category,
  );
  const nextUp = upcoming[0];

  // Counted across the whole history, not the visible tab: the strip states what
  // the member's record IS, and swapping tabs must not appear to change it.
  const stats: { key: string; label: string; value: number; icon: IconName }[] = [
    { key: 'upcoming', label: t('stats.upcoming'), value: upcoming.length, icon: 'calendar' },
    {
      key: 'attended',
      label: t('stats.attended'),
      value: entries.filter((entry) => entry.status === 'ATTENDED').length,
      icon: 'check',
    },
    {
      key: 'waitlist',
      label: t('stats.waitlist'),
      value: entries.filter((entry) => entry.status === 'WAITLIST').length,
      icon: 'clock',
    },
    { key: 'total', label: t('stats.total'), value: entries.length, icon: 'ticket' },
  ];

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.stats)}>
        {stats.map((stat) => (
          <Card key={stat.key} padding="none" xstyle={styles.statCard}>
            <Icon name={stat.icon} {...stylex.props(styles.statIcon)} />
            <p {...stylex.props(styles.statValue)}>
              <CountUp to={stat.value} />
            </p>
            <p {...stylex.props(styles.statLabel)}>{stat.label}</p>
          </Card>
        ))}
      </div>

      {nextUp ? <NextUpHero entry={nextUp} now={now} locale={locale} timeZone={timeZone} /> : null}

      <div {...stylex.props(styles.controls)}>
        <SegmentedControl
          label={t('viewLabel')}
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: `${t('upcoming')} · ${upcoming.length}` },
            { value: 'past', label: `${t('past')} · ${past.length}` },
          ]}
        />

        <FilterChips
          label={t('filters.label')}
          chips={chips}
          active={category}
          onSelect={setCategory}
          xstyle={styles.filters}
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="calendar" {...stylex.props(styles.emptyIcon)} />}
            title={view === 'upcoming' ? t('noUpcoming') : t('noPast')}
            body={view === 'upcoming' ? t('noUpcomingHint') : t('noPastHint')}
            action={
              view === 'upcoming' ? (
                <ButtonLink
                  href="/member/classes"
                  variant="primary"
                  size="card"
                  label={t('empty.action')}
                />
              ) : null
            }
          />
        </Card>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {shown.map((entry) => (
            <BookingHistoryCard
              timeZone={timeZone}
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

/** The soonest upcoming class, as a full-width lime block. */
function NextUpHero({
  entry,
  now,
  locale,
  timeZone,
}: {
  entry: MemberBookingHistoryEntry;
  now: number;
  locale: string;
  timeZone: string;
}) {
  const t = useTranslations('account.bookings');
  const { classInstance: instance } = entry;
  const day = relativeDayLabel(instance.startsAt, now, locale, timeZone, t);

  return (
    <div {...stylex.props(styles.hero)}>
      <div {...stylex.props(styles.heroRow)}>
        <div {...stylex.props(styles.heroTime)}>
          <p {...stylex.props(styles.heroDay)}>{day}</p>
          <p {...stylex.props(styles.heroClock)}>{formatZonedTime(instance.startsAt, timeZone)}</p>
          <p {...stylex.props(styles.heroDuration)}>
            {formatDuration(instance.startsAt, instance.endsAt)}
          </p>
        </div>
        <span aria-hidden {...stylex.props(styles.heroRule)} />
        <div {...stylex.props(styles.heroBody)}>
          <p {...stylex.props(styles.heroLabel)}>{t('nextUp')}</p>
          <h2 {...stylex.props(styles.heroTitle)}>{instance.title}</h2>
          <p {...stylex.props(styles.heroMeta)}>
            {instance.trainerName ? (
              <span {...stylex.props(styles.heroMetaItem)}>
                <Icon name="user" {...stylex.props(styles.heroMetaIcon)} sw={2.2} />
                {instance.trainerName}
              </span>
            ) : null}
            {instance.locationName ? (
              <span {...stylex.props(styles.heroMetaItem)}>
                <Icon name="pin" {...stylex.props(styles.heroMetaIcon)} sw={2.2} />
                {instance.locationName}
              </span>
            ) : null}
          </p>
        </div>
        <ButtonLink
          href={`/member/classes/${instance.id}`}
          variant="secondary"
          size="card"
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
