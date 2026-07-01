'use client';

import { useMemo } from 'react';
import {
  buildRRule,
  describeRecurrence,
  recurrenceSchema,
  type Recurrence,
  type RecurrenceEnd,
  type RecurrenceFreq,
  type RecurrenceWeekday,
} from '@fit/types';
import { FREQ_OPTIONS, WEEKDAY_OPTIONS, freqNoun } from './format';

/** Shared field styling so the editor matches the rest of the form. */
const FIELD_CLASS =
  'h-11 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white';

/**
 * The visual RRULE editor (T5.2). Instead of typing an RFC-5545 string by hand,
 * staff pick a frequency, an every-N interval, the weekdays (for a weekly class),
 * and an end condition (never / after N occurrences / until a date). The component
 * is fully controlled: it owns no state, lifting the structured {@link Recurrence}
 * up to the form, which derives the canonical rrule string via {@link buildRRule}
 * on submit. A live human summary ({@link describeRecurrence}) and the generated
 * rule are shown so the staffer can see exactly what they're scheduling.
 *
 * Weekly with no weekday selected is flagged inline (the schema rejects it), so
 * the form can block submit before the API ever sees an ambiguous rule.
 */
export function RecurrenceEditor({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
}) {
  // A weekly recurrence needs at least one weekday — surface it inline.
  const weeklyNeedsDay = value.freq === 'WEEKLY' && value.weekdays.length === 0;

  // The live summary + generated rule, recomputed only when a valid recurrence.
  const { summary, rrule } = useMemo(() => {
    const parsed = recurrenceSchema.safeParse(value);
    if (!parsed.success) {
      return { summary: null as string | null, rrule: null as string | null };
    }
    return { summary: describeRecurrence(parsed.data), rrule: buildRRule(parsed.data) };
  }, [value]);

  function setFreq(freq: RecurrenceFreq): void {
    onChange({ ...value, freq });
  }

  function setInterval(raw: string): void {
    const interval = Math.max(1, Math.min(52, Number(raw) || 1));
    onChange({ ...value, interval });
  }

  function toggleWeekday(day: RecurrenceWeekday): void {
    const has = value.weekdays.includes(day);
    const weekdays = has ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day];
    onChange({ ...value, weekdays });
  }

  function setEnd(end: RecurrenceEnd): void {
    onChange({ ...value, end });
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-card border border-ink-200 p-4 dark:border-white/10">
      <legend className="px-1 text-sm font-medium text-ink-700 dark:text-ink-200">Repeats</legend>

      {/* Frequency + interval. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="rec-freq" className="text-xs font-medium text-ink-600 dark:text-ink-300">
            Frequency
          </label>
          <select
            id="rec-freq"
            value={value.freq}
            onChange={(event) => setFreq(event.target.value as RecurrenceFreq)}
            className={FIELD_CLASS}
          >
            {FREQ_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="rec-interval" className="text-xs font-medium text-ink-600 dark:text-ink-300">
            Every
          </label>
          <div className="flex items-center gap-2">
            <input
              id="rec-interval"
              type="number"
              min="1"
              max="52"
              step="1"
              inputMode="numeric"
              value={value.interval}
              onChange={(event) => setInterval(event.target.value)}
              className={`${FIELD_CLASS} w-20`}
            />
            <span className="text-sm text-ink-500 dark:text-ink-400">
              {freqNoun(value.freq)}
              {value.interval === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Weekday toggles, only for a weekly recurrence. */}
      {value.freq === 'WEEKLY' ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-600 dark:text-ink-300">On these days</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = value.weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleWeekday(day.value)}
                  className={[
                    'rounded-btn border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/15 dark:text-brand-200'
                      : 'border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/5',
                  ].join(' ')}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {weeklyNeedsDay ? (
            <p className="text-xs text-warning-700 dark:text-warning-300">
              Pick at least one weekday.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* End condition. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-ink-600 dark:text-ink-300">Ends</span>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
            <input
              type="radio"
              name="rec-end"
              checked={value.end.type === 'never'}
              onChange={() => setEnd({ type: 'never' })}
              className="h-4 w-4 text-brand-600 focus:ring-brand-400"
            />
            Never
          </label>

          <label className="flex flex-wrap items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
            <input
              type="radio"
              name="rec-end"
              checked={value.end.type === 'count'}
              onChange={() => setEnd({ type: 'count', count: 10 })}
              className="h-4 w-4 text-brand-600 focus:ring-brand-400"
            />
            After
            <input
              type="number"
              min="1"
              max="730"
              step="1"
              inputMode="numeric"
              disabled={value.end.type !== 'count'}
              value={value.end.type === 'count' ? value.end.count : ''}
              onChange={(event) =>
                setEnd({ type: 'count', count: Math.max(1, Number(event.target.value) || 1) })
              }
              className={`${FIELD_CLASS} w-20 disabled:bg-ink-50 disabled:text-ink-400 dark:disabled:bg-white/5`}
            />
            occurrences
          </label>

          <label className="flex flex-wrap items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
            <input
              type="radio"
              name="rec-end"
              checked={value.end.type === 'until'}
              onChange={() =>
                setEnd({ type: 'until', until: value.end.type === 'until' ? value.end.until : '' })
              }
              className="h-4 w-4 text-brand-600 focus:ring-brand-400"
            />
            On date
            <input
              type="date"
              disabled={value.end.type !== 'until'}
              value={value.end.type === 'until' ? value.end.until : ''}
              onChange={(event) => setEnd({ type: 'until', until: event.target.value })}
              className={`${FIELD_CLASS} disabled:bg-ink-50 disabled:text-ink-400 dark:disabled:bg-white/5`}
            />
          </label>
        </div>
      </div>

      {/* Live preview of what the rule schedules. */}
      <div className="rounded-field bg-ink-50 px-3 py-2 text-sm dark:bg-white/5">
        {summary ? (
          <>
            <p className="font-medium text-ink-700 dark:text-ink-200">{summary}</p>
            <p className="mt-0.5 font-mono text-xs text-ink-400">{rrule}</p>
          </>
        ) : (
          <p className="text-ink-400">Finish the recurrence to see a preview.</p>
        )}
      </div>
    </fieldset>
  );
}
