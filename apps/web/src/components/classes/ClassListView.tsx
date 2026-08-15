'use client';

import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { ClassInstanceCard } from '@fit/types';
import { Icon } from '@/src/components/ui';
import { ClassOccupancy } from './ClassOccupancy';
import { formatZonedTime, groupByZonedDay } from './date-utils';
import { createDateTimeFormat } from '@fit/i18n';

// Astryx migration (T11.12): the list view is rebuilt on the Astryx `Card` over
// the Fit brand theme, with every row authored in compiled StyleX
// (`var(--color-*)`) and the shared brand `ClassOccupancy` meter — no Tailwind
// utilities and no formacore Aurora-glass primitives. Behaviour is unchanged:
// grouping is derived from `instances`; clicking a row opens the parent's drawer.

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
    paddingInline: '0.25rem',
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  groupCount: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
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
      ':hover': 'var(--color-tint-hover)',
      ':focus-visible': 'var(--color-tint-hover)',
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.875rem',
    fontWeight: 700,
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
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
  },
  metaAvatar: {
    display: 'flex',
    height: '1.25rem',
    width: '1.25rem',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    fontSize: '0.625rem',
    fontWeight: 700,
    color: 'var(--color-text-accent)',
  },
  metaDot: {
    color: 'var(--color-text-disabled)',
  },
  metaIcon: {
    height: '0.875rem',
    width: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  occupancy: {
    maxWidth: '20rem',
  },
  actionCol: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'var(--radius-full)',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  pillBook: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  pillFull: {
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
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

/** First letters of the first and last words of a name, upper-cased (max 2). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

/**
 * List view: the week's classes grouped into day sections, each row a Card with
 * a left time block, an accent colour bar, the title + category badge, the
 * trainer + room, an occupancy bar, and a primary action. Stateless — grouping
 * is derived from the `instances` the parent supplies; clicking a row opens the
 * detail drawer the parent owns.
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
                  <Card variant="default" padding={0} xstyle={styles.rowCard}>
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
                                <span aria-hidden {...stylex.props(styles.metaAvatar)}>
                                  {initials(instance.trainerName)}
                                </span>
                                {instance.trainerName}
                              </span>
                            )}
                            {instance.trainerName && instance.locationName && (
                              <span aria-hidden {...stylex.props(styles.metaDot)}>
                                ·
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
                        <span
                          {...stylex.props(styles.pill, isFull ? styles.pillFull : styles.pillBook)}
                        >
                          {isFull ? t('card.joinWaitlist') : t('drawer.book')}
                        </span>
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
