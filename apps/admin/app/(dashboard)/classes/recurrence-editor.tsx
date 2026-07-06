'use client';

import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  buildRRule,
  describeRecurrence,
  recurrenceSchema,
  type Recurrence,
  type RecurrenceEnd,
  type RecurrenceFreq,
  type RecurrenceWeekday,
} from '@fit/types';
import { Field, Input, Select } from '@/components/ui';
import { FREQ_OPTIONS, WEEKDAY_OPTIONS, freqNoun } from './format';

const styles = stylex.create({
  fieldset: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '1rem',
  },
  legend: {
    paddingInline: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  freqRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  freqField: {
    width: '10rem',
  },
  everyInner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  w20: {
    width: '5rem',
  },
  w44: {
    width: '11rem',
  },
  everyNoun: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  weekdayRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  weekdayBtn: {
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  weekdayInactive: {
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
  },
  weekdayActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  endWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  endLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  endOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  radioLabelWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  radio: {
    width: '1rem',
    height: '1rem',
    accentColor: 'var(--color-accent)',
  },
  preview: {
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
  },
  previewSummary: {
    margin: 0,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  previewRule: {
    marginTop: '0.125rem',
    marginBottom: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  previewEmpty: {
    margin: 0,
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The visual RRULE editor. Instead of typing an RFC-5545 string by hand, staff
 * pick a frequency, an every-N interval, the weekdays (for a weekly class), and
 * an end condition (never / after N occurrences / until a date). The component is
 * fully controlled: it owns no state, lifting the structured {@link Recurrence}
 * up to the form, which derives the canonical rrule string via {@link buildRRule}
 * on submit. A live human summary ({@link describeRecurrence}) and the generated
 * rule are shown so the staffer can see exactly what they're scheduling.
 *
 * Rebuilt on the shared formacore form kit (`Field` / `Input` / `Select` from
 * `@fit/ui-web`), so its controls read identically to the rest of the admin
 * forms. Weekly with no weekday selected is flagged inline via the field's error
 * slot (the schema rejects it), so the form can block submit before the API ever
 * sees an ambiguous rule.
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
    <fieldset {...stylex.props(styles.fieldset)}>
      <legend {...stylex.props(styles.legend)}>Repeats</legend>

      {/* Frequency + interval. */}
      <div {...stylex.props(styles.freqRow)}>
        <div {...stylex.props(styles.freqField)}>
          <Field label="Frequency" htmlFor="rec-freq">
            <Select
              id="rec-freq"
              value={value.freq}
              onChange={(event) => setFreq(event.target.value as RecurrenceFreq)}
            >
              {FREQ_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Every" htmlFor="rec-interval">
          <div {...stylex.props(styles.everyInner)}>
            <div {...stylex.props(styles.w20)}>
              <Input
                id="rec-interval"
                type="number"
                min="1"
                max="52"
                step="1"
                inputMode="numeric"
                value={value.interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </div>
            <span {...stylex.props(styles.everyNoun)}>
              {freqNoun(value.freq)}
              {value.interval === 1 ? '' : 's'}
            </span>
          </div>
        </Field>
      </div>

      {/* Weekday toggles, only for a weekly recurrence. */}
      {value.freq === 'WEEKLY' ? (
        <Field
          label="On these days"
          error={weeklyNeedsDay ? 'Pick at least one weekday.' : undefined}
        >
          <div {...stylex.props(styles.weekdayRow)}>
            {WEEKDAY_OPTIONS.map((day) => {
              const active = value.weekdays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleWeekday(day.value)}
                  {...stylex.props(
                    styles.weekdayBtn,
                    active ? styles.weekdayActive : styles.weekdayInactive,
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </Field>
      ) : null}

      {/* End condition. */}
      <div {...stylex.props(styles.endWrap)}>
        <span {...stylex.props(styles.endLabel)}>Ends</span>
        <div {...stylex.props(styles.endOptions)}>
          <label {...stylex.props(styles.radioLabel)}>
            <input
              type="radio"
              name="rec-end"
              checked={value.end.type === 'never'}
              onChange={() => setEnd({ type: 'never' })}
              {...stylex.props(styles.radio)}
            />
            Never
          </label>

          <label {...stylex.props(styles.radioLabelWrap)}>
            <input
              type="radio"
              name="rec-end"
              checked={value.end.type === 'count'}
              onChange={() => setEnd({ type: 'count', count: 10 })}
              {...stylex.props(styles.radio)}
            />
            After
            <div {...stylex.props(styles.w20)}>
              <Input
                type="number"
                min="1"
                max="730"
                step="1"
                inputMode="numeric"
                aria-label="Number of occurrences"
                disabled={value.end.type !== 'count'}
                value={value.end.type === 'count' ? value.end.count : ''}
                onChange={(event) =>
                  setEnd({ type: 'count', count: Math.max(1, Number(event.target.value) || 1) })
                }
              />
            </div>
            occurrences
          </label>

          <label {...stylex.props(styles.radioLabelWrap)}>
            <input
              type="radio"
              name="rec-end"
              checked={value.end.type === 'until'}
              onChange={() =>
                setEnd({ type: 'until', until: value.end.type === 'until' ? value.end.until : '' })
              }
              {...stylex.props(styles.radio)}
            />
            On date
            <div {...stylex.props(styles.w44)}>
              <Input
                type="date"
                aria-label="End date"
                disabled={value.end.type !== 'until'}
                value={value.end.type === 'until' ? value.end.until : ''}
                onChange={(event) => setEnd({ type: 'until', until: event.target.value })}
              />
            </div>
          </label>
        </div>
      </div>

      {/* Live preview of what the rule schedules. */}
      <div {...stylex.props(styles.preview)}>
        {summary ? (
          <>
            <p {...stylex.props(styles.previewSummary)}>{summary}</p>
            <p {...stylex.props(styles.previewRule)}>{rrule}</p>
          </>
        ) : (
          <p {...stylex.props(styles.previewEmpty)}>Finish the recurrence to see a preview.</p>
        )}
      </div>
    </fieldset>
  );
}
