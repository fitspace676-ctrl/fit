'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import {
  MAX_WINDOWS_PER_DAY,
  WEEKDAYS,
  type AvailabilityWindow,
  type WeeklyAvailability,
  type Weekday,
} from '@fit/types';
import { Btn, Icon, Switch, useToast } from '@/components/ui';
import { setTrainerAvailabilityAction } from '../actions';

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    padding: '1.25rem',
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  headText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  sectionLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  intro: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  days: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  day: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '0.875rem',
  },
  dayHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  dayName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  dayNameOff: {
    color: 'var(--color-text-secondary)',
  },
  toggleWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  toggleLabel: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  windows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  windowRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  timeInput: {
    height: '2.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.625rem',
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  dash: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  iconBtn: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  iconBtnSvg: {
    width: '1rem',
    height: '1rem',
  },
  addBtn: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    cursor: 'pointer',
  },
  addBtnDisabled: {
    color: 'var(--color-text-secondary)',
    cursor: 'not-allowed',
  },
  addIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
  offNote: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  dayError: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.75rem',
  },
  resetBtn: {
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  errorBanner: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-error-muted)',
    padding: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/** A fresh window for an "Add hours" click — the schema's own 09:00–17:00 default. */
const DEFAULT_WINDOW: AvailabilityWindow = { start: '09:00', end: '17:00' };

/**
 * The trainer's weekly availability editor (T5.11) — the Availability tab's real
 * control surface, replacing the placeholder that pointed at the profile form
 * (which never edited hours at all).
 *
 * A day is a toggle plus a list of bookable windows, because a trainer's day is
 * not one open/close pair like a location's: split shifts (a morning block and an
 * evening block) are the normal case, so each day holds up to
 * {@link MAX_WINDOWS_PER_DAY} non-overlapping ranges.
 *
 * The three rules the API enforces (`dayAvailabilitySchema`) are mirrored here per
 * day — end after start, no overlaps, an available day needs a window — and
 * surfaced against the offending day rather than as a `400` banner after the
 * round-trip. Saving `PUT`s the whole week as one document and then adopts the
 * canonicalised week the API returns (unavailable days cleared, windows sorted),
 * so the editor never drifts from what is actually stored.
 */
export function TrainerAvailabilityEditor({
  trainerId,
  initial,
  canWrite,
}: {
  trainerId: string;
  initial: WeeklyAvailability;
  canWrite: boolean;
}) {
  const t = useTranslations('admin.trainers');
  const days = useTranslations('admin.settings.weekday');
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<WeeklyAvailability>(initial);
  const [week, setWeek] = useState<WeeklyAvailability>(initial);
  const [error, setError] = useState<string | null>(null);

  /** Per-day validation messages, mirroring the schema the API re-checks with. */
  const dayErrors = useMemo(() => {
    const out: Partial<Record<Weekday, string>> = {};
    for (const day of WEEKDAYS) {
      const value = week[day];
      if (!value.available) continue;
      if (value.windows.length === 0) {
        out[day] = t('availability.errorNeedsWindow');
        continue;
      }
      if (value.windows.some((w) => w.end <= w.start)) {
        out[day] = t('availability.errorEndAfterStart');
        continue;
      }
      const sorted = [...value.windows].sort((a, b) => a.start.localeCompare(b.start));
      if (sorted.some((w, i) => i > 0 && w.start < sorted[i - 1]!.end)) {
        out[day] = t('availability.errorOverlap');
      }
    }
    return out;
  }, [week, t]);

  const hasErrors = Object.keys(dayErrors).length > 0;
  const dirty = useMemo(() => JSON.stringify(week) !== JSON.stringify(saved), [week, saved]);

  function patchDay(day: Weekday, patch: Partial<WeeklyAvailability[Weekday]>): void {
    setWeek((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  /** Turning a day on with no hours yet seeds the default window, so it is never invalid on arrival. */
  function toggleDay(day: Weekday, available: boolean): void {
    const windows = week[day].windows;
    patchDay(day, {
      available,
      windows: available && windows.length === 0 ? [{ ...DEFAULT_WINDOW }] : windows,
    });
  }

  function patchWindow(day: Weekday, index: number, patch: Partial<AvailabilityWindow>): void {
    patchDay(day, {
      windows: week[day].windows.map((w, i) => (i === index ? { ...w, ...patch } : w)),
    });
  }

  function addWindow(day: Weekday): void {
    if (week[day].windows.length >= MAX_WINDOWS_PER_DAY) return;
    patchDay(day, { windows: [...week[day].windows, { ...DEFAULT_WINDOW }] });
  }

  /** Removing the last window leaves the day on but empty — the day error then says why. */
  function removeWindow(day: Weekday, index: number): void {
    patchDay(day, { windows: week[day].windows.filter((_, i) => i !== index) });
  }

  function onSave(): void {
    setError(null);
    if (hasErrors) return;
    startTransition(async () => {
      const result = await setTrainerAvailabilityAction(trainerId, { availability: week });
      if (result.ok) {
        setSaved(result.data.availability);
        setWeek(result.data.availability);
        toast(t('availability.savedToast'), { tone: 'success', icon: 'check' });
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.headText)}>
          <h3 {...stylex.props(styles.sectionLabel)}>{t('tabs.weeklyAvailability')}</h3>
          <p {...stylex.props(styles.intro)}>
            {canWrite ? t('availability.intro') : t('availability.readOnly')}
          </p>
        </div>
      </div>

      <div {...stylex.props(styles.days)}>
        {WEEKDAYS.map((day) => {
          const value = week[day];
          const label = days(day);
          const atMax = value.windows.length >= MAX_WINDOWS_PER_DAY;
          return (
            <div key={day} {...stylex.props(styles.day)}>
              <div {...stylex.props(styles.dayHead)}>
                <span {...stylex.props(styles.dayName, value.available ? null : styles.dayNameOff)}>
                  {label}
                </span>
                <span {...stylex.props(styles.toggleWrap)}>
                  <span {...stylex.props(styles.toggleLabel)}>
                    {value.available ? t('availability.working') : t('availability.notWorking')}
                  </span>
                  {canWrite ? (
                    <Switch
                      checked={value.available}
                      onChange={(next) => toggleDay(day, next)}
                      label={t('availability.toggleAria', { day: label })}
                    />
                  ) : null}
                </span>
              </div>

              {value.available ? (
                <div {...stylex.props(styles.windows)}>
                  {value.windows.map((window, index) => (
                    <div key={index} {...stylex.props(styles.windowRow)}>
                      <input
                        type="time"
                        disabled={!canWrite}
                        aria-label={t('availability.startAria', { day: label, index: index + 1 })}
                        value={window.start}
                        onChange={(event) => patchWindow(day, index, { start: event.target.value })}
                        {...stylex.props(styles.timeInput)}
                      />
                      <span aria-hidden {...stylex.props(styles.dash)}>
                        –
                      </span>
                      <input
                        type="time"
                        disabled={!canWrite}
                        aria-label={t('availability.endAria', { day: label, index: index + 1 })}
                        value={window.end}
                        onChange={(event) => patchWindow(day, index, { end: event.target.value })}
                        {...stylex.props(styles.timeInput)}
                      />
                      {canWrite ? (
                        <button
                          type="button"
                          aria-label={t('availability.removeAria', {
                            day: label,
                            index: index + 1,
                          })}
                          onClick={() => removeWindow(day, index)}
                          {...stylex.props(styles.iconBtn)}
                        >
                          <Icon name="x" {...stylex.props(styles.iconBtnSvg)} sw={2} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {canWrite ? (
                    <button
                      type="button"
                      disabled={atMax}
                      onClick={() => addWindow(day)}
                      {...stylex.props(styles.addBtn, atMax ? styles.addBtnDisabled : null)}
                    >
                      <Icon name="plus" {...stylex.props(styles.addIcon)} sw={2} />
                      {atMax
                        ? t('availability.maxWindows', { max: MAX_WINDOWS_PER_DAY })
                        : t('availability.addWindow')}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p {...stylex.props(styles.offNote)}>{t('availability.dayOff')}</p>
              )}

              {dayErrors[day] ? (
                <p role="alert" {...stylex.props(styles.dayError)}>
                  {dayErrors[day]}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" {...stylex.props(styles.errorBanner)}>
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <div {...stylex.props(styles.actions)}>
          <Btn type="button" v="primary" onClick={onSave} disabled={pending || hasErrors || !dirty}>
            {pending ? t('availability.saving') : t('availability.save')}
          </Btn>
          {dirty && !pending ? (
            <button type="button" onClick={() => setWeek(saved)} {...stylex.props(styles.resetBtn)}>
              {t('availability.reset')}
            </button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
