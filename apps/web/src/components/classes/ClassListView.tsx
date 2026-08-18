'use client';

import { useMemo } from 'react';
import { Avatar, Badge, Card } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { Icon } from '@/src/components/ui';
import { ClassOccupancy } from './ClassOccupancy';
import { formatZonedTime, groupByZonedDay } from './date-utils';
import { createDateTimeFormat } from '@fit/i18n';

// Astryx migration (T11), now on the portal kit: the list view is rebuilt on the kit's `Card` over
// the FormaCore theme, with every row authored in compiled StyleX
// (`var(--color-*)`) and the shared brand `ClassOccupancy` meter — no Tailwind
// utilities and no formacore Aurora-glass primitives. Behaviour is unchanged:
// grouping is derived from `instances`; clicking a row opens the parent's booking modal.
//
// DESIGN PASS.
//
//   • THE FAKE BUTTON IS GONE. Each row ended in a filled lime pill reading
//     "Book" — a `<span>` inside the row's own `<button>`, so it could not be
//     clicked separately and did not book anything; it opened the drawer, like
//     every other pixel of the row. It also put a column of lime down the whole
//     page, in a direction that spends its entire colour budget on one lime. The
//     row now ends in what it actually offers: how many spots are left, and a
//     chevron saying the row opens.
//   • The title was 14px/700 — the same weight as the day heading above it and
//     barely above the meta line below it, so a row had no focal point. It is
//     17px/800 now, matching the booking card's title.
//   • The trainer's initials were a private disc; the kit has `Avatar`, which
//     the booking card already uses for the same face in the same place.
//   • Rows run two-up from `lg`, like the bookings board. A class row stretched
//     to 1180px is a time, a title and a meter separated by a void.

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  groupHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '0.5rem',
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  groupCount: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': 'repeat(2, minmax(0, 1fr))',
    },
    alignItems: 'start',
    gap: '0.75rem',
  },
  rowCard: {
    padding: 0,
    overflow: 'hidden',
  },
  rowButton: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '1rem',
    width: '100%',
    padding: '1rem',
    textAlign: 'left',
    borderWidth: 0,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-overlay-hover)',
      ':focus-visible': 'var(--color-overlay-hover)',
    },
    cursor: 'pointer',
    outline: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  accent: {
    width: '0.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  timeBlock: {
    display: 'flex',
    width: '5rem',
    flexShrink: 0,
    flexDirection: 'column',
  },
  time: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  duration: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  body: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
    flexDirection: 'column',
    gap: '0.5rem',
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  title: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 800,
    lineHeight: 1.25,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  // Neutral chip, coloured dot — see the note on the same chip in
  // `account/BookingHistoryCard.tsx`. The gym's per-class-type hex stays
  // meaningful as the dot; the chip itself never takes a fill, so the lime
  // remains the only filled colour on the page.
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
    paddingInline: '0.625rem',
    paddingBlock: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  chipDot: {
    height: '0.375rem',
    width: '0.375rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '0.875rem',
    rowGap: '0.25rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    minWidth: 0,
  },
  metaIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  occupancy: {
    maxWidth: '20rem',
  },
  // What the row actually offers: the remaining count, and a chevron saying the
  // row opens. No fake CTA — the whole row is the control.
  actionCol: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    alignSelf: 'center',
    gap: '0.5rem',
  },
  chevron: {
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-disabled)',
  },
});

export interface ClassListViewProps {
  instances: ClassInstanceCard[];
  /** Called with a class id when its row is clicked. */
  onClassClick: (id: string) => void;
  /**
   * The gym's IANA zone. Every time below is read in it rather than in the
   * viewer's — a class is a wall-clock commitment at the gym.
   */
  timeZone: string;
}

/** Whole minutes between two ISO instants. */
function durationMinutes(startsAt: string, endsAt: string): number {
  return Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000);
}

/**
 * List view: the week's classes grouped into day sections, each row a Card with
 * a left time block, an accent colour bar, the title + category badge, the
 * trainer + room, an occupancy bar, and how many spots are left. Stateless —
 * grouping is derived from the `instances` the parent supplies; clicking a row
 * opens the booking modal the parent owns.
 */
export function ClassListView({ instances, onClassClick, timeZone }: ClassListViewProps) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const groups = useMemo(() => groupByZonedDay(instances, timeZone), [instances, timeZone]);

  return (
    <section aria-label={t('listView.label')} {...stylex.props(styles.root)}>
      {groups.map((group) => (
        <div key={group.key} {...stylex.props(styles.group)}>
          <h3 {...stylex.props(styles.groupHead)}>
            {createDateTimeFormat(locale, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            }).format(group.date)}
            <span {...stylex.props(styles.groupCount)}>
              {t('listView.count', { count: group.items.length })}
            </span>
          </h3>

          <ul {...stylex.props(styles.list)}>
            {group.items.map((instance) => {
              const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
              const isFull = spotsLeft === 0;
              return (
                <li key={instance.id}>
                  <Card padding="none" xstyle={styles.rowCard}>
                    <button
                      type="button"
                      onClick={() => onClassClick(instance.id)}
                      {...stylex.props(styles.rowButton)}
                    >
                      {/* Accent colour bar from the class instance. */}
                      <span
                        aria-hidden
                        {...stylex.props(styles.accent)}
                        style={{ backgroundColor: instance.color }}
                      />

                      {/* Left time block: mono time + duration. */}
                      <div {...stylex.props(styles.timeBlock)}>
                        <span {...stylex.props(styles.time)}>
                          {formatZonedTime(instance.startsAt, timeZone)}
                        </span>
                        <span {...stylex.props(styles.duration)}>
                          {durationMinutes(instance.startsAt, instance.endsAt)}m
                        </span>
                      </div>

                      <div {...stylex.props(styles.body)}>
                        <div {...stylex.props(styles.titleRow)}>
                          <span {...stylex.props(styles.title)}>{instance.title}</span>
                          {instance.category && (
                            <span {...stylex.props(styles.chip)}>
                              <span
                                aria-hidden
                                {...stylex.props(styles.chipDot)}
                                style={{ backgroundColor: instance.color }}
                              />
                              {instance.category}
                            </span>
                          )}
                        </div>

                        {(instance.trainerName || instance.locationName) && (
                          <div {...stylex.props(styles.meta)}>
                            {instance.trainerName && (
                              <span {...stylex.props(styles.metaItem)}>
                                <Avatar name={instance.trainerName} size={20} />
                                {instance.trainerName}
                              </span>
                            )}
                            {instance.locationName && (
                              <span {...stylex.props(styles.metaItem)}>
                                <Icon name="pin" {...stylex.props(styles.metaIcon)} sw={2} />
                                {instance.locationName}
                              </span>
                            )}
                          </div>
                        )}

                        <ClassOccupancy
                          value={instance.bookedCount}
                          cap={instance.capacity}
                          xstyle={styles.occupancy}
                        />
                      </div>

                      <div {...stylex.props(styles.actionCol)}>
                        {/* Two signals, not a heat scale — the occupancy meter
                            beside it already carries "how full". */}
                        <Badge
                          tone={isFull ? 'pending' : 'positive'}
                          label={
                            isFull ? t('card.full') : t('card.spotsLeft', { count: spotsLeft })
                          }
                        />
                        <Icon
                          name="chevronRight"
                          aria-hidden
                          {...stylex.props(styles.chevron)}
                          sw={2.2}
                        />
                      </div>
                    </button>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
