'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {
  RECURRENCE_WEEKDAYS,
  type AdminServiceRow,
  type RecurrenceFreq,
  type RecurrenceWeekday,
  type ServiceStaffOption,
  type ServiceType,
} from '@fit/types';
import { Button } from '@fit/ui-kit';
import { createServiceAction, updateServiceAction } from './actions';

const WEEKDAY_LABEL: Record<RecurrenceWeekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};
const FREQS: ReadonlyArray<{ value: RecurrenceFreq; label: string }> = [
  { value: 'ONCE', label: 'Once' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
];

const styles = stylex.create({
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  label: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  hint: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  input: {
    height: '2.75rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.9375rem',
  },
  textarea: { minHeight: '5rem', paddingBlock: '0.625rem' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' },
  segment: { display: 'flex', gap: '0.375rem' },
  segmentItem: {
    flex: 1,
    height: '2.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  segmentActive: {
    backgroundColor: 'var(--color-accent)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '0.375rem' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '0.75rem',
    borderRadius: '999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipActive: { backgroundColor: 'var(--color-accent-muted)', borderColor: 'var(--color-accent)' },
  error: { fontSize: '0.8125rem', color: 'var(--color-error)' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem' },
});

/** `"12.50"` → 1250 minor units; blank / malformed → null. */
function inputToMinor(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

const minorToInput = (minor: number): string => (minor / 100).toFixed(2);

type Props = {
  staff: ServiceStaffOption[];
  onSuccess: () => void;
  onCancel: () => void;
} & ({ mode: 'create'; type: ServiceType } | { mode: 'edit'; service: AdminServiceRow });

/**
 * The service form body. Its shape follows the type: a personal-training service
 * has no name (generated from the trainer) and no schedule, and can only be
 * assigned to a trainer; a custom service has both and any staff member.
 */
export function ServiceForm(props: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const type: ServiceType = props.mode === 'create' ? props.type : props.service.type;
  const existing = props.mode === 'edit' ? props.service : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [staffId, setStaffId] = useState(existing?.staff.id ?? '');
  const [price, setPrice] = useState(existing ? minorToInput(existing.priceMinor) : '');
  const [duration, setDuration] = useState(String(existing?.durationMinutes ?? 60));
  const [description, setDescription] = useState(existing?.description ?? '');
  const [freq, setFreq] = useState<RecurrenceFreq>(existing?.schedule?.freq ?? 'WEEKLY');
  const [weekdays, setWeekdays] = useState<RecurrenceWeekday[]>(existing?.schedule?.weekdays ?? []);
  const [startDate, setStartDate] = useState(existing?.schedule?.startDate ?? '');
  const [startTime, setStartTime] = useState(existing?.schedule?.startTime ?? '18:00');
  const [until, setUntil] = useState(existing?.schedule?.until ?? '');
  const [error, setError] = useState<string | null>(null);

  const staffOptions =
    type === 'PERSONAL_TRAINING' ? props.staff.filter((s) => s.isTrainer) : props.staff;

  function toggleWeekday(day: RecurrenceWeekday): void {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : RECURRENCE_WEEKDAYS.filter((d) => d === day || current.includes(d)),
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    const priceMinor = inputToMinor(price);
    if (priceMinor === null) {
      setError('Enter a price');
      return;
    }
    const profile = {
      staffId,
      priceMinor,
      durationMinutes: Number(duration),
      description,
    };
    const schedule = {
      freq,
      weekdays: freq === 'WEEKLY' ? weekdays : [],
      startDate,
      startTime,
      until: freq === 'ONCE' ? null : until || null,
    };

    startTransition(async () => {
      const result =
        props.mode === 'edit'
          ? await updateServiceAction(props.service.id, {
              ...profile,
              ...(type === 'CUSTOM' ? { name, schedule } : {}),
            })
          : await createServiceAction(
              type === 'CUSTOM' ? { type, name, schedule, ...profile } : { type, ...profile },
            );
      if (result.ok) {
        props.onSuccess();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {type === 'CUSTOM' ? (
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-name" {...stylex.props(styles.label)}>
            Name
          </label>
          <input
            id="service-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            {...stylex.props(styles.input)}
          />
        </div>
      ) : (
        <p {...stylex.props(styles.hint)}>
          Named after the trainer automatically — e.g. “Personal training — Nino Beridze”.
        </p>
      )}

      <div {...stylex.props(styles.field)}>
        <label htmlFor="service-staff" {...stylex.props(styles.label)}>
          Staff member
        </label>
        <select
          id="service-staff"
          value={staffId}
          onChange={(e) => setStaffId(e.target.value)}
          required
          {...stylex.props(styles.input)}
        >
          <option value="">Choose…</option>
          {staffOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {type === 'PERSONAL_TRAINING' && staffOptions.length === 0 ? (
          <p {...stylex.props(styles.hint)}>
            No staff member has a trainer profile yet — add one under Trainers first.
          </p>
        ) : null}
      </div>

      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-price" {...stylex.props(styles.label)}>
            Price per session
          </label>
          <input
            id="service-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            {...stylex.props(styles.input)}
          />
        </div>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-duration" {...stylex.props(styles.label)}>
            Duration (minutes)
          </label>
          <input
            id="service-duration"
            type="number"
            min={15}
            max={480}
            step={5}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            {...stylex.props(styles.input)}
          />
        </div>
      </div>

      <div {...stylex.props(styles.field)}>
        <label htmlFor="service-description" {...stylex.props(styles.label)}>
          Description
        </label>
        <textarea
          id="service-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          {...stylex.props(styles.input, styles.textarea)}
        />
      </div>

      {type === 'CUSTOM' ? (
        <>
          <div {...stylex.props(styles.field)}>
            <span {...stylex.props(styles.label)}>Repeats</span>
            <div role="radiogroup" aria-label="Repeats" {...stylex.props(styles.segment)}>
              {FREQS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={freq === option.value}
                  onClick={() => setFreq(option.value)}
                  {...stylex.props(
                    styles.segmentItem,
                    freq === option.value && styles.segmentActive,
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {freq === 'WEEKLY' ? (
            <div {...stylex.props(styles.field)}>
              <span {...stylex.props(styles.label)}>On</span>
              <div {...stylex.props(styles.chips)}>
                {RECURRENCE_WEEKDAYS.map((day) => (
                  <label
                    key={day}
                    {...stylex.props(styles.chip, weekdays.includes(day) && styles.chipActive)}
                  >
                    <input
                      type="checkbox"
                      checked={weekdays.includes(day)}
                      onChange={() => toggleWeekday(day)}
                      aria-label={WEEKDAY_LABEL[day]}
                    />
                    {WEEKDAY_LABEL[day]}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div {...stylex.props(styles.row)}>
            <div {...stylex.props(styles.field)}>
              <label htmlFor="service-start-date" {...stylex.props(styles.label)}>
                {freq === 'ONCE' ? 'Date' : 'Starts on'}
              </label>
              <input
                id="service-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                {...stylex.props(styles.input)}
              />
            </div>
            <div {...stylex.props(styles.field)}>
              <label htmlFor="service-start-time" {...stylex.props(styles.label)}>
                Time
              </label>
              <input
                id="service-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                {...stylex.props(styles.input)}
              />
            </div>
          </div>

          {freq !== 'ONCE' ? (
            <div {...stylex.props(styles.field)}>
              <label htmlFor="service-until" {...stylex.props(styles.label)}>
                Until (optional)
              </label>
              <input
                id="service-until"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                {...stylex.props(styles.input)}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="secondary"
          size="page"
          label="Cancel"
          onClick={props.onCancel}
          type="button"
        />
        <Button
          variant="primary"
          size="page"
          label={props.mode === 'edit' ? 'Save changes' : 'Create service'}
          type="submit"
          disabled={isPending}
        />
      </div>
    </form>
  );
}
