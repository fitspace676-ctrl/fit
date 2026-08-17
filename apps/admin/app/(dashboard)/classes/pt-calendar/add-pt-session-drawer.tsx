'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import type { AdminClassTypeOption } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import type { TrainerOption } from './trainer-select';
import { createPtSessionAction } from './pt-session-actions';

/** A workout type (class type) the session's "what" selector offers. */
export type ClassTypeOption = AdminClassTypeOption;

const styles = stylex.create({
  drawer: {
    height: 'calc(100dvh - 1.5rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
  },
  triggerIcon: { width: '1rem', height: '1rem' },
  header: { paddingBlock: '0.5rem' },
  content: { padding: '1.5rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '1rem' },
  colFlex: {
    flex: '1 1 8rem',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  labelOptional: { fontWeight: 400, color: 'var(--color-text-secondary)' },
  field: {
    height: '2.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
  textarea: {
    minHeight: '5rem',
    resize: 'vertical',
    paddingBlock: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
  actions: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  cancelButton: {
    appearance: 'none',
    border: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
});

/**
 * "Add PT session" — a right-hand slide-in drawer on the PT Calendar tab. Schedules
 * one session: trainer + workout type + date + time + duration + notes.
 *
 * The trainer is chosen **here**, not before the calendar will render — the tab opens
 * on every trainer's week, and picking one is part of scheduling. When the calendar
 * happens to be filtered to a trainer, that choice prefills the field.
 *
 * The calendar positions blocks by their UTC clock time (like the class schedule), so
 * the chosen date + time are sent as a UTC instant. On success the calendar refreshes
 * and the drawer closes in place.
 */
export function AddPtSessionDrawer({
  trainers,
  defaultTrainerId,
  classTypes,
  defaultDate,
}: {
  trainers: TrainerOption[];
  /** The trainer the calendar is filtered to, when any — prefills the picker. */
  defaultTrainerId: string | null;
  classTypes: ClassTypeOption[];
  /** The visible week's Monday (`YYYY-MM-DD`) — the date field's sensible default. */
  defaultDate: string;
}) {
  const drawer = useSlideDrawer();

  return (
    <>
      <Button
        variant="primary"
        size="block"
        label="Add PT session"
        icon={<Icon name="plus" sw={2} {...stylex.props(styles.triggerIcon)} />}
        onClick={drawer.open}
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        aria-label="Add PT session"
        width="34rem"
        maxHeight="100dvh"
        position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
        padding={6}
        xstyle={[styles.drawer, drawer.motion]}
      >
        <Layout
          height="fill"
          header={
            <DialogHeader
              title="Add PT session"
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <PtSessionForm
                key={drawer.contentKey}
                trainers={trainers}
                defaultTrainerId={defaultTrainerId}
                classTypes={classTypes}
                defaultDate={defaultDate}
                onSuccess={drawer.requestClose}
                onCancel={drawer.requestClose}
              />
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}

function PtSessionForm({
  trainers,
  defaultTrainerId,
  classTypes,
  defaultDate,
  onSuccess,
  onCancel,
}: {
  trainers: TrainerOption[];
  defaultTrainerId: string | null;
  classTypes: ClassTypeOption[];
  defaultDate: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Prefilled from the calendar's filter when there is one; a lone trainer is picked
  // for the staffer, since there is nothing to choose between.
  const [trainerId, setTrainerId] = useState(
    defaultTrainerId ?? (trainers.length === 1 ? (trainers[0]?.id ?? '') : ''),
  );
  const [classTypeId, setClassTypeId] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [notes, setNotes] = useState('');

  /** Picking a workout type prefills the duration with that type's default. */
  function onClassTypeChange(nextId: string): void {
    setClassTypeId(nextId);
    const picked = classTypes.find((type) => type.id === nextId);
    if (picked) {
      setDurationMinutes(String(picked.durationMinutes));
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    if (!trainerId) {
      setError('Pick the trainer taking this session.');
      return;
    }
    if (!classTypeId) {
      setError('Pick a workout type for this session.');
      return;
    }
    // The calendar positions blocks by UTC clock time, so send the chosen wall time
    // as a UTC instant (matching how the class schedule stores its occurrences).
    const startsAt = `${date}T${time}:00.000Z`;

    startTransition(async () => {
      const result = await createPtSessionAction({
        trainerId,
        classTypeId,
        startsAt,
        durationMinutes: Number(durationMinutes),
        notes,
      });
      if (result.ok) {
        router.refresh();
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="pt-trainer-pick" {...stylex.props(styles.label)}>
          Trainer
        </label>
        <select
          id="pt-trainer-pick"
          value={trainerId}
          onChange={(e) => setTrainerId(e.target.value)}
          {...stylex.props(styles.field)}
        >
          <option value="">
            {trainers.length === 0 ? 'No trainers yet' : 'Select a trainer…'}
          </option>
          {trainers.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
            </option>
          ))}
        </select>
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="pt-class-type" {...stylex.props(styles.label)}>
          Workout type
        </label>
        <select
          id="pt-class-type"
          value={classTypeId}
          onChange={(e) => onClassTypeChange(e.target.value)}
          required
          {...stylex.props(styles.field)}
        >
          <option value="">
            {classTypes.length === 0 ? 'No workout types yet' : 'Select a workout type…'}
          </option>
          {classTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="pt-date" {...stylex.props(styles.label)}>
            Date
          </label>
          <input
            id="pt-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            {...stylex.props(styles.field)}
          />
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="pt-time" {...stylex.props(styles.label)}>
            Start time
          </label>
          <input
            id="pt-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            {...stylex.props(styles.field)}
          />
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="pt-duration" {...stylex.props(styles.label)}>
            Duration (min)
          </label>
          <input
            id="pt-duration"
            type="number"
            min={1}
            inputMode="numeric"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="60"
            {...stylex.props(styles.field)}
          />
        </div>
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="pt-notes" {...stylex.props(styles.label)}>
          Notes <span {...stylex.props(styles.labelOptional)}>(optional)</span>
        </label>
        <textarea
          id="pt-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What's the focus of this session?"
          {...stylex.props(styles.textarea)}
        />
      </div>

      {error ? (
        <Card padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
        </Card>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Button
          variant="primary"
          size="card"
          type="submit"
          disabled={pending}
          label={pending ? 'Saving…' : 'Add session'}
        />
        <button type="button" onClick={onCancel} {...stylex.props(styles.cancelButton)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
