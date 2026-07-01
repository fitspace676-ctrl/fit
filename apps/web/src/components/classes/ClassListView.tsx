'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassInstanceCard } from '@fit/types';
import { Badge, Card, Occupancy } from '@/src/components/ui';
import { formatTime, groupByDay } from './date-utils';

export interface ClassListViewProps {
  instances: ClassInstanceCard[];
  /** Called with a class id when its row is clicked. */
  onClassClick: (id: string) => void;
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
export function ClassListView({ instances, onClassClick }: ClassListViewProps) {
  const t = useTranslations('classes');
  const locale = useLocale();
  const groups = useMemo(() => groupByDay(instances), [instances]);

  return (
    <section aria-label={t('listView.label')} className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
          <h3 className="flex items-baseline gap-2 px-1 text-sm font-bold text-ink-900 dark:text-white">
            {group.date.toLocaleDateString(locale, {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
            })}
            <span className="font-normal text-ink-400">
              {t('listView.count', { count: group.items.length })}
            </span>
          </h3>

          <ul className="flex flex-col gap-3">
            {group.items.map((instance) => {
              const spotsLeft = Math.max(instance.capacity - instance.bookedCount, 0);
              const isFull = spotsLeft === 0;
              return (
                <li key={instance.id}>
                  <Card glow className="p-0">
                    <button
                      type="button"
                      onClick={() => onClassClick(instance.id)}
                      className="flex w-full items-stretch gap-4 p-4 text-left transition-colors hover:bg-ink-50 focus:bg-ink-50 focus:outline-none dark:hover:bg-white/5 dark:focus:bg-white/5"
                    >
                      {/* Accent colour bar from the class instance. */}
                      <span
                        aria-hidden
                        className="w-1 shrink-0 rounded-full"
                        style={{ backgroundColor: instance.color }}
                      />

                      {/* Left time block: mono time + duration. */}
                      <div className="flex w-20 shrink-0 flex-col">
                        <span className="font-mono text-base font-bold tabular-nums text-ink-900 dark:text-white">
                          {formatTime(instance.startsAt, locale)}
                        </span>
                        <span className="font-mono text-xs text-ink-400">
                          {durationMinutes(instance.startsAt, instance.endsAt)}m
                        </span>
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-display text-sm font-bold text-ink-900 dark:text-white">
                            {instance.title}
                          </span>
                          {instance.category && <Badge tone="brand">{instance.category}</Badge>}
                        </div>

                        {(instance.trainerName || instance.locationName) && (
                          <div className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                            {instance.trainerName && (
                              <span className="flex items-center gap-1.5">
                                <span
                                  aria-hidden
                                  className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-600 dark:bg-white/10 dark:text-brand-300"
                                >
                                  {initials(instance.trainerName)}
                                </span>
                                {instance.trainerName}
                              </span>
                            )}
                            {instance.trainerName && instance.locationName && (
                              <span aria-hidden className="text-ink-300">
                                ·
                              </span>
                            )}
                            {instance.locationName && <span>{instance.locationName}</span>}
                          </div>
                        )}

                        <Occupancy
                          value={instance.bookedCount}
                          cap={instance.capacity}
                          className="max-w-xs"
                        />
                      </div>

                      <div className="flex shrink-0 items-center">
                        <span
                          className={`inline-flex items-center rounded-pill px-3 py-1.5 text-xs font-semibold ${
                            isFull
                              ? 'bg-ink-100 text-ink-500 dark:bg-white/10 dark:text-ink-300'
                              : 'bg-[linear-gradient(135deg,#7C3AED,#EC4899)] text-white shadow-[0_6px_24px_-6px_rgba(98,87,227,0.7)]'
                          }`}
                        >
                          {isFull ? t('card.full') : t('drawer.book')}
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
