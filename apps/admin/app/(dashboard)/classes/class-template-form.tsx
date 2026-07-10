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
  type ClassPricingRule,
  type ClassTemplateStatus,
  type Recurrence,
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
  pricingBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1rem',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  planList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  planChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-body)',
    color: 'var(--color-text-secondary)',
    fontSize: '0.8125rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  planChipActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
});

/** The default recurrence a new template starts on — a weekly Monday class. */
const DEFAULT_RECURRENCE: Recurrence = {
  freq: 'WEEKLY',
  interval: 1,
  weekdays: ['MO'],
  end: { type: 'never' },
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

type Props = {
  trainers: RelationOption[];
  locations: RelationOption[];
  plans: RelationOption[];
} & (
  | { mode: 'create' }
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

/** A stored minor-unit amount (or null) → the major-unit string the input shows. */
function minorToMajor(minor: number | null): string {
  return minor === null ? '' : (minor / 100).toString();
}

/** A major-unit input string → minor units, or null when blank/invalid. */
function majorToMinor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const major = Number(trimmed);
  if (!Number.isFinite(major)) return null;
  return Math.round(major * 100);
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
        rrule: buildRRule(DEFAULT_RECURRENCE),
        color: '#2563eb',
        pricingRule: 'FREE',
        priceMinor: null,
        includedPlanIds: [],
        minAttendance: null,
        pt30Minor: null,
        pt45Minor: null,
        pt60Minor: null,
        validFrom: todayIso(),
        validUntil: null,
      };

  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [trainerId, setTrainerId] = useState(initial.trainerId ?? '');
  const [locationId, setLocationId] = useState(initial.locationId ?? '');
  const [room, setRoom] = useState(initial.room ?? '');
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [color, setColor] = useState(initial.color);
  const [validFrom, setValidFrom] = useState(initial.validFrom);
  const [validUntil, setValidUntil] = useState(initial.validUntil ?? '');
  const [status, setStatus] = useState<ClassTemplateStatus>('ACTIVE');
  // Pricing (parity with the reference class-type pricing). Money fields are held
  // as major-unit strings for a friendly input and converted to minor on submit.
  const [pricingRule, setPricingRule] = useState<ClassPricingRule>(initial.pricingRule);
  const [price, setPrice] = useState(minorToMajor(initial.priceMinor));
  const [includedPlanIds, setIncludedPlanIds] = useState<string[]>(initial.includedPlanIds);
  const [minAttendance, setMinAttendance] = useState(
    initial.minAttendance === null ? '' : String(initial.minAttendance),
  );
  const [pt30, setPt30] = useState(minorToMajor(initial.pt30Minor));
  const [pt45, setPt45] = useState(minorToMajor(initial.pt45Minor));
  const [pt60, setPt60] = useState(minorToMajor(initial.pt60Minor));
  // Seed the recurrence from the stored rrule (edit), falling back to the default.
  const [recurrence, setRecurrence] = useState<Recurrence>(
    () => parseRRule(initial.rrule) ?? DEFAULT_RECURRENCE,
  );

  const togglePlan = (planId: string): void =>
    setIncludedPlanIds((current) =>
      current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId],
    );

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);

    // The recurrence must be valid before we can derive an rrule for the wire.
    const parsedRecurrence = recurrenceSchema.safeParse(recurrence);
    if (!parsedRecurrence.success) {
      setError(parsedRecurrence.error.issues[0]?.message ?? 'Finish the recurrence');
      return;
    }

    const profile = {
      title,
      description,
      category,
      trainerId: trainerId === '' ? null : trainerId,
      locationId: locationId === '' ? null : locationId,
      room: room.trim() === '' ? null : room.trim(),
      capacity: Number(capacity),
      durationMinutes: Number(durationMinutes),
      rrule: buildRRule(parsedRecurrence.data),
      color,
      pricingRule,
      priceMinor: pricingRule === 'PAID' ? majorToMinor(price) : null,
      includedPlanIds: pricingRule === 'INCLUDED' ? includedPlanIds : [],
      minAttendance: minAttendance.trim() === '' ? null : Number(minAttendance),
      pt30Minor: majorToMinor(pt30),
      pt45Minor: majorToMinor(pt45),
      pt60Minor: majorToMinor(pt60),
      validFrom,
      validUntil: validUntil === '' ? null : validUntil,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateClassTemplateAction(props.templateId, profile)
        : await createClassTemplateAction({ ...profile, status });
      if (result.ok) {
        router.push(`/classes/${result.data.id}`);
        router.refresh();
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
          <label htmlFor="class-category" {...stylex.props(styles.label)}>
            Category <span {...stylex.props(styles.labelOptional)}>(optional)</span>
          </label>
          <input
            id="class-category"
            name="category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            autoComplete="off"
            placeholder="e.g. Cardio"
            {...stylex.props(styles.field)}
          />
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
      </div>

      {/* The visual recurrence editor — produces the stored rrule on submit. */}
      <RecurrenceEditor value={recurrence} onChange={setRecurrence} />

      {/* Validity window. */}
      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-valid-from" {...stylex.props(styles.label)}>
            Starts
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
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="class-valid-until" {...stylex.props(styles.label)}>
            Ends <span {...stylex.props(styles.labelOptional)}>(blank = open-ended)</span>
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
      </div>

      {/* Default trainer / location / room. */}
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
            Location <span {...stylex.props(styles.labelOptional)}>(optional)</span>
          </label>
          <select
            id="class-location"
            name="locationId"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            {...stylex.props(styles.field)}
          >
            <option value="">No default location</option>
            {props.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="class-room" {...stylex.props(styles.label)}>
          Room <span {...stylex.props(styles.labelOptional)}>(optional)</span>
        </label>
        <input
          id="class-room"
          name="room"
          type="text"
          value={room}
          onChange={(event) => setRoom(event.target.value)}
          autoComplete="off"
          placeholder="e.g. Studio A"
          {...stylex.props(styles.field)}
        />
      </div>

      {/* Pricing — how members pay for this class (parity with the reference). */}
      <div {...stylex.props(styles.pricingBox)}>
        <div {...stylex.props(styles.row)}>
          <div {...stylex.props(styles.colFlex)}>
            <label htmlFor="class-pricing-rule" {...stylex.props(styles.label)}>
              Pricing
            </label>
            <select
              id="class-pricing-rule"
              name="pricingRule"
              value={pricingRule}
              onChange={(event) => setPricingRule(event.target.value as ClassPricingRule)}
              {...stylex.props(styles.field)}
            >
              <option value="FREE">Free for members</option>
              <option value="INCLUDED">Included in selected plans</option>
              <option value="PAID">Paid per session</option>
            </select>
          </div>
          <div {...stylex.props(styles.colFlex)}>
            <label htmlFor="class-min-attendance" {...stylex.props(styles.label)}>
              Min attendance <span {...stylex.props(styles.labelOptional)}>(optional)</span>
            </label>
            <input
              id="class-min-attendance"
              name="minAttendance"
              type="number"
              min={0}
              inputMode="numeric"
              value={minAttendance}
              onChange={(event) => setMinAttendance(event.target.value)}
              placeholder="e.g. 3"
              {...stylex.props(styles.field)}
            />
          </div>
        </div>

        {pricingRule === 'PAID' ? (
          <div {...stylex.props(styles.fieldGroup)}>
            <label htmlFor="class-price" {...stylex.props(styles.label)}>
              Price per session
            </label>
            <input
              id="class-price"
              name="price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="e.g. 15.00"
              {...stylex.props(styles.field)}
            />
          </div>
        ) : null}

        {pricingRule === 'INCLUDED' ? (
          <div {...stylex.props(styles.fieldGroup)}>
            <span {...stylex.props(styles.label)}>Included in plans</span>
            {props.plans.length === 0 ? (
              <p {...stylex.props(styles.hint)}>No membership plans yet — create one first.</p>
            ) : (
              <div {...stylex.props(styles.planList)}>
                {props.plans.map((plan) => {
                  const active = includedPlanIds.includes(plan.id);
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => togglePlan(plan.id)}
                      {...stylex.props(styles.planChip, active && styles.planChipActive)}
                    >
                      {active ? <Icon name="check" sw={2.5} className="h-3.5 w-3.5" /> : null}
                      {plan.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div {...stylex.props(styles.fieldGroup)}>
          <span {...stylex.props(styles.label)}>
            Personal-training rates <span {...stylex.props(styles.labelOptional)}>(optional)</span>
          </span>
          <div {...stylex.props(styles.row)}>
            <div {...stylex.props(styles.colFlex)}>
              <label htmlFor="class-pt30" {...stylex.props(styles.hint)}>
                30 min
              </label>
              <input
                id="class-pt30"
                name="pt30"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={pt30}
                onChange={(event) => setPt30(event.target.value)}
                placeholder="0.00"
                {...stylex.props(styles.field)}
              />
            </div>
            <div {...stylex.props(styles.colFlex)}>
              <label htmlFor="class-pt45" {...stylex.props(styles.hint)}>
                45 min
              </label>
              <input
                id="class-pt45"
                name="pt45"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={pt45}
                onChange={(event) => setPt45(event.target.value)}
                placeholder="0.00"
                {...stylex.props(styles.field)}
              />
            </div>
            <div {...stylex.props(styles.colFlex)}>
              <label htmlFor="class-pt60" {...stylex.props(styles.hint)}>
                60 min
              </label>
              <input
                id="class-pt60"
                name="pt60"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={pt60}
                onChange={(event) => setPt60(event.target.value)}
                placeholder="0.00"
                {...stylex.props(styles.field)}
              />
            </div>
          </div>
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
        <Link href={cancelHref} {...stylex.props(styles.cancelLink)}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
