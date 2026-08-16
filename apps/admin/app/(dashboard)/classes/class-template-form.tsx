'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import {
  buildRRule,
  parseRRule,
  recurrenceSchema,
  type AdminClassTypeOption,
  type ClassPricingRule,
  type ClassTemplateStatus,
  type Recurrence,
  type RecurrenceWeekday,
} from '@fit/types';
import { Btn, Icon } from '@/components/ui';
import { createClassTemplateAction, updateClassTemplateAction } from './actions';
import { RecurrenceEditor } from './recurrence-editor';

/** A trainer / location option the default-assignment selects offer. */
export interface RelationOption {
  id: string;
  name: string;
}

/** Selectable initial statuses when creating (lifecycle change is a separate action). */
const CREATE_STATUSES: ReadonlyArray<{ value: ClassTemplateStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PAUSED', label: 'Paused' },
];

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    maxWidth: '42rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  colFlex: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: '0.25rem',
  },
  colColor: {
    display: 'flex',
    width: '8rem',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  labelOptional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  field: {
    height: '2.75rem',
    width: '100%',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    paddingBlock: 0,
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-disabled)',
    },
    outline: 'none',
  },
  textarea: {
    width: '100%',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':disabled': 'var(--color-background-muted)',
    },
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-primary)',
      ':disabled': 'var(--color-text-disabled)',
    },
    outline: 'none',
  },
  colorField: {
    height: '2.75rem',
    width: '100%',
    paddingInline: '0.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
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
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  cancelLink: {
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  cancelButton: {
    appearance: 'none',
    border: 'none',
    background: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
});

/** The default recurrence a new template starts on — a weekly Monday class. */
const DEFAULT_RECURRENCE: Recurrence = {
  freq: 'WEEKLY',
  weekdays: ['MO'],
};

type Initial = {
  title: string;
  description: string;
  category: string;
  trainerId: string | null;
  locationId: string | null;
  room: string | null;
  capacity: number;
  durationMinutes: number;
  startTime: string;
  rrule: string;
  color: string;
  pricingRule: ClassPricingRule;
  priceMinor: number | null;
  includedPlanIds: string[];
  minAttendance: number | null;
  pt30Minor: number | null;
  pt45Minor: number | null;
  pt60Minor: number | null;
  validFrom: string;
  validUntil: string | null;
};

/**
 * What a click on the schedule's empty grid carries into this form: the slot the
 * operator pointed at. Everything else keeps its normal default, so the drawer
 * opens on a class that already starts where they clicked and repeats on the day
 * they clicked — one field (the title) from being savable.
 */
export interface ClassFormSeed {
  /** `HH:MM` the class starts at — the snapped slot. */
  startTime: string;
  /** `YYYY-MM-DD` the recurrence starts on — the clicked column's date. */
  validFrom: string;
  /** The clicked column's weekday, the day the class repeats on. */
  weekday: RecurrenceWeekday;
}

type Props = {
  trainers: RelationOption[];
  locations: RelationOption[];
  plans: RelationOption[];
  /** The gym's active class types — the "Class type" selector's options. */
  classTypes: AdminClassTypeOption[];
  /**
   * Drawer host hook. When set, a successful create refreshes the roster and calls
   * this instead of navigating to the new template's page, so the drawer can close
   * over the still-mounted list. Omitted on the standalone `/classes/new` page.
   */
  onSuccess?: () => void;
  /** Drawer host hook — replaces the Cancel link with a close button when set. */
  onCancel?: () => void;
} & (
  | { mode: 'create'; seed?: ClassFormSeed }
  | {
      mode: 'edit';
      templateId: string;
      initial: Initial;
    }
);

/** Today's date as `YYYY-MM-DD`, the default validity start for a new template. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The create / edit class-template form (T5.2). One component serves both flows.
 * Beyond the profile fields (title, description, category, capacity, duration,
 * color) it owns:
 *
 *  • The visual {@link RecurrenceEditor} — the structured cadence the stored
 *    RFC-5545 `rrule` string is derived from on submit (and re-parsed into on
 *    edit).
 *  • A validity window (`validFrom` required, `validUntil` optional/open-ended).
 *  • Optional default trainer / location selects, populated from the gym's active
 *    rosters.
 *
 * On success it navigates to the template's detail page; the discriminated
 * `ActionResult` surfaces any API error inline without throwing across the Server
 * Action boundary.
 */
export function ClassTemplateForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: Initial = isEdit
    ? props.initial
    : {
        title: '',
        description: '',
        category: '',
        trainerId: null,
        locationId: null,
        room: null,
        capacity: 12,
        durationMinutes: 60,
        startTime: props.seed?.startTime ?? '09:00',
        rrule: buildRRule(
          props.seed ? { freq: 'WEEKLY', weekdays: [props.seed.weekday] } : DEFAULT_RECURRENCE,
        ),
        color: '#2563eb',
        pricingRule: 'FREE',
        priceMinor: null,
        includedPlanIds: [],
        minAttendance: null,
        pt30Minor: null,
        pt45Minor: null,
        pt60Minor: null,
        validFrom: props.seed?.validFrom ?? todayIso(),
        validUntil: null,
      };

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [trainerId, setTrainerId] = useState(initial.trainerId ?? '');
  const [locationId, setLocationId] = useState(initial.locationId ?? '');
  // Room has no control any more — the gym doesn't use it at this stage. The
  // value is still read from the record and submitted back untouched, so editing
  // a template that has one does not silently clear it.
  const [room] = useState(initial.room ?? '');
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [startTime, setStartTime] = useState(initial.startTime);
  const [color, setColor] = useState(initial.color);
  const [validFrom, setValidFrom] = useState(initial.validFrom);
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? '');
  const [status, setStatus] = useState<ClassTemplateStatus>('ACTIVE');
  // Seed the recurrence from the stored rrule (edit), falling back to the default.
  const [recurrence, setRecurrence] = useState<Recurrence>(
    () => parseRRule(initial.rrule) ?? DEFAULT_RECURRENCE,
  );

  /**
   * Picking a class type stores the type's name (kept in `category` for grouping)
   * and, on create, seeds the reusable defaults the type carries — capacity,
   * duration, colour, and the title when still blank. Clearing it leaves the
   * already-entered values untouched.
   */
  function onClassTypeChange(typeId: string): void {
    const picked = props.classTypes.find((type) => type.id === typeId);
    setCategory(picked?.name ?? '');
    if (isEdit || !picked) return;
    setCapacity(String(picked.capacity));
    setDurationMinutes(String(picked.durationMinutes));
    setColor(picked.color);
    if (title.trim() === '') setTitle(picked.name);
  }

  // Reflect the stored type name back to its id so the select shows the right row.
  const selectedClassTypeId = props.classTypes.find((type) => type.name === category)?.id ?? '';

  /** A one-off runs on its start date and stops — no weekdays, no end date. */
  const isOneOff = recurrence.freq === 'ONCE';

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // The recurrence must be valid before we can derive an rrule for the wire.
    const parsedRecurrence = recurrenceSchema.safeParse(recurrence);
    if (!parsedRecurrence.success) {
      setError(parsedRecurrence.error.issues[0]?.message ?? 'Finish the recurrence');
      return;
    }

    const pricedType = props.classTypes.find((type) => type.id === selectedClassTypeId);

    const profile = {
      title,
      description,
      category,
      trainerId: trainerId === '' ? null : trainerId,
      locationId,
      room: room.trim() === '' ? null : room.trim(),
      capacity: Number(capacity),
      durationMinutes: Number(durationMinutes),
      startTime,
      rrule: buildRRule(parsedRecurrence.data),
      color,
      // Pricing is the class type's answer, not a second question here. Copied at
      // save because nothing links a template to its type, so this is a snapshot:
      // repricing a type does not reprice templates already built from it.
      pricingRule: pricedType?.pricingRule ?? 'FREE',
      priceMinor: pricedType?.pricingRule === 'PAID' ? (pricedType.priceMinor ?? null) : null,
      includedPlanIds:
        pricedType?.pricingRule === 'INCLUDED' ? (pricedType.includedPlanIds ?? []) : [],
      minAttendance: pricedType?.minAttendance ?? null,
      pt30Minor: null,
      pt45Minor: null,
      pt60Minor: null,
      validFrom,
      // A one-off is bounded by its own rule (`COUNT=1`), so it never carries a
      // window — including when the frequency was switched away from a repeating
      // one that had an end date typed into the now-hidden field.
      validUntil: isOneOff || validUntil === '' ? null : validUntil,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateClassTemplateAction(props.templateId, profile)
        : await createClassTemplateAction({ ...profile, status });
      if (result.ok) {
        if (props.onSuccess) {
          // Drawer flow: keep the roster on screen, just refresh it and close.
          router.refresh();
          props.onSuccess();
        } else {
          router.push(`/classes/${result.data.id}`);
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  }

  const cancelHref = isEdit ? `/classes/${props.templateId}` : '/classes';

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="class-title" {...stylex.props(styles.label)}>
          Title
        </label>
        <input
          id="class-title"
          name="title"
          type="text"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
          placeholder="e.g. Morning HIIT"
          {...stylex.props(styles.field)}
        />
      </div>

      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-type" {...stylex.props(styles.label)}>
            Class type
          </label>
          <select
            id="class-type"
            name="category"
            required
            value={selectedClassTypeId}
            onChange={(event) => onClassTypeChange(event.target.value)}
            {...stylex.props(styles.field)}
          >
            {/* Required because the type is where pricing is decided — a template
                without one would have no answer to copy. Kept selectable-but-empty
                so a template saved before this rule still renders. */}
            <option value="" disabled>
              {props.classTypes.length === 0 ? 'No class types yet' : 'Select a class type…'}
            </option>
            {props.classTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div {...stylex.props(styles.colColor)}>
          <label htmlFor="class-color" {...stylex.props(styles.label)}>
            Color
          </label>
          <input
            id="class-color"
            name="color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            {...stylex.props(styles.colorField)}
          />
        </div>
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="class-description" {...stylex.props(styles.label)}>
          Description <span {...stylex.props(styles.labelOptional)}>(optional)</span>
        </label>
        <textarea
          id="class-description"
          name="description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="A short description of the class."
          {...stylex.props(styles.textarea)}
        />
      </div>

      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-capacity" {...stylex.props(styles.label)}>
            Capacity
          </label>
          <input
            id="class-capacity"
            name="capacity"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            required
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            placeholder="12"
            {...stylex.props(styles.field)}
          />
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-duration" {...stylex.props(styles.label)}>
            Duration (minutes)
          </label>
          <input
            id="class-duration"
            name="durationMinutes"
            type="number"
            min="1"
            max="1440"
            step="1"
            inputMode="numeric"
            required
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
            placeholder="60"
            {...stylex.props(styles.field)}
          />
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-start-time" {...stylex.props(styles.label)}>
            Starts at
          </label>
          <input
            id="class-start-time"
            name="startTime"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            {...stylex.props(styles.field)}
          />
        </div>
      </div>

      {/* The visual recurrence editor — produces the stored rrule on submit. */}
      <RecurrenceEditor value={recurrence} onChange={setRecurrence} />

      {/*
        Validity window — or, for a one-off, just the date it happens. `ONCE`
        stops after its first occurrence, so an end date has nothing left to
        bound; the field is hidden rather than left there to be filled in with an
        answer that would be ignored.
      */}
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-valid-from" {...stylex.props(styles.label)}>
            {isOneOff ? 'Date' : 'Starts'}
          </label>
          <input
            id="class-valid-from"
            name="validFrom"
            type="date"
            required
            value={validFrom}
            onChange={(event) => setValidFrom(event.target.value)}
            {...stylex.props(styles.field)}
          />
        </div>
        {isOneOff ? (
          // An empty half so the date keeps its column width instead of
          // stretching across the row the moment the end date disappears.
          <div aria-hidden {...stylex.props(styles.colFlex)} />
        ) : (
          <div {...stylex.props(styles.colFlex)}>
            <label htmlFor="class-valid-until" {...stylex.props(styles.label)}>
              Ends
            </label>
            <input
              id="class-valid-until"
              name="validUntil"
              type="date"
              min={validFrom}
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
              {...stylex.props(styles.field)}
            />
          </div>
        )}
      </div>

      {/* Default trainer / location. */}
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-trainer" {...stylex.props(styles.label)}>
            Trainer <span {...stylex.props(styles.labelOptional)}>(optional)</span>
          </label>
          <select
            id="class-trainer"
            name="trainerId"
            value={trainerId}
            onChange={(event) => setTrainerId(event.target.value)}
            {...stylex.props(styles.field)}
          >
            <option value="">No default trainer</option>
            {props.trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name}
              </option>
            ))}
          </select>
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-location" {...stylex.props(styles.label)}>
            Location
          </label>
          <select
            id="class-location"
            name="locationId"
            required
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            {...stylex.props(styles.field)}
          >
            {/* Empty and unselectable: a class has to be somewhere, but a
                template saved before that rule — or a gym with no branches yet —
                still has to render, so the placeholder exists and simply cannot
                be submitted. */}
            <option value="" disabled>
              Select a location
            </option>
            {props.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isEdit ? (
        <div {...stylex.props(styles.fieldGroup)}>
          <label htmlFor="class-status" {...stylex.props(styles.label)}>
            Status
          </label>
          <select
            id="class-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ClassTemplateStatus)}
            {...stylex.props(styles.field)}
          >
            {CREATE_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
        </Card>
      ) : null}

      <div {...stylex.props(styles.actions)}>
        <Btn type="submit" v="primary" size="md" disabled={pending}>
          {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create class'}
        </Btn>
        {props.onCancel ? (
          <button
            type="button"
            onClick={props.onCancel}
            {...stylex.props(styles.cancelButton, styles.cancelLink)}
          >
            Cancel
          </button>
        ) : (
          <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
