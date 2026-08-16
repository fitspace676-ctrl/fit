'use client';

import * as stylex from '@stylexjs/stylex';
import type { Recurrence, RecurrenceFreq, RecurrenceWeekday } from '@fit/types';
import { Field, Select } from '@/components/ui';
import { FREQ_OPTIONS, WEEKDAY_OPTIONS } from './format';

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
  freqField: {
    width: '10rem',
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
  hint: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The visual RRULE editor. Instead of typing an RFC-5545 string by hand, staff
 * pick a frequency and, for a weekly class, the weekdays it runs on.
 * The component is fully controlled: it owns no state, lifting the structured
 * {@link Recurrence} up to the form, which derives the canonical rrule string on
 * submit. The controls are the whole surface: staff read the schedule off them
 * rather than off a rendered rule, so no preview of the generated RRULE is shown.
 *
 * Rebuilt on the shared formacore form kit (`Field` / `Select` from
 * `@fit/ui-web`), so its controls read identically to the rest of the admin
 * forms. Weekly with no weekday selected is flagged inline via the field's error
 * slot (the schema rejects it), so the form can block submit before the API ever
 * sees an ambiguous rule.
 *
 * There is no end condition here. How long a *series* runs is the template's
 * `validFrom` / `validUntil` window, which the surrounding form already asks for
 * under a field labelled "Ends" — collecting it twice invited two answers to one
 * question. The one-off frequency is the exception that proves it: `ONCE` has no
 * end to set, so the form hides the field entirely rather than asking for a date
 * that could only ever be the start date.
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

  function setFreq(freq: RecurrenceFreq): void {
    onChange({ ...value, freq });
  }

  function toggleWeekday(day: RecurrenceWeekday): void {
    const has = value.weekdays.includes(day);
    const weekdays = has ? value.weekdays.filter((d) => d !== day) : [...value.weekdays, day];
    onChange({ ...value, weekdays });
  }

  return (
    <fieldset {...stylex.props(styles.fieldset)}>
      <legend {...stylex.props(styles.legend)}>Repeats</legend>

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

      {/*
        A one-off has nothing else to ask: no weekdays, and no end — it runs on
        the start date and is done. Say so, because an empty fieldset otherwise
        reads as a form that failed to render its controls.
      */}
      {value.freq === 'ONCE' ? (
        <p {...stylex.props(styles.hint)}>
          Runs once, on the start date below. There is no end date.
        </p>
      ) : null}

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
    </fieldset>
  );
}
