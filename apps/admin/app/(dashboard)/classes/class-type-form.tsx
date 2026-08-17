'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { ClassPricingRule, ClassTypeStatus } from '@fit/types';
import { Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import type { RelationOption } from './class-template-form';
import { createClassTypeAction, updateClassTypeAction } from './class-type-actions';

/** The preset calendar colours a class type can wear (matches the reference swatches). */
const COLOR_SWATCHES = [
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#ef4444',
  '#14b8a6',
  '#6366f1',
  '#f59e0b',
  '#06b6d4',
] as const;

/** Selectable statuses when creating / editing a type. */
const STATUSES: ReadonlyArray<{ value: ClassTypeStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  colFlex: {
    flex: '1 1 8rem',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  labelOptional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  field: {
    height: '2.75rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
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
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.75rem',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
  },
  swatches: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  swatch: {
    width: '2rem',
    height: '2rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    padding: 0,
  },
  swatchActive: {
    borderColor: 'var(--color-text-primary)',
  },
  pricingBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-muted)',
  },
  hint: {
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
    height: '2.25rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.8125rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
  },
  planChipActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  planChipIcon: {
    width: '0.875rem',
    height: '0.875rem',
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

/** One class type's editable fields, as the edit form pre-fills them. */
export type ClassTypeInitial = {
  name: string;
  description: string;
  durationMinutes: number;
  capacity: number;
  minAttendance: number | null;
  color: string;
  pricingRule: ClassPricingRule;
  priceMinor: number | null;
  includedPlanIds: string[];
  status: ClassTypeStatus;
};

type Props = {
  plans: RelationOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
} & ({ mode: 'create' } | { mode: 'edit'; typeId: string; initial: ClassTypeInitial });

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
 * The create / edit form for a class type — the reusable catalogue entry (Boxing,
 * CrossFit) staff schedule occurrences of. Unlike the class *template* form it has
 * no recurrence or validity window: a type is a kind of class, not a schedule.
 * On success it refreshes the roster and hands control back to the drawer host.
 */
export function ClassTypeForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isEdit = props.mode === 'edit';
  const initial: ClassTypeInitial = isEdit
    ? props.initial
    : {
        name: '',
        description: '',
        durationMinutes: 60,
        capacity: 20,
        minAttendance: null,
        color: COLOR_SWATCHES[0],
        pricingRule: 'FREE',
        priceMinor: null,
        includedPlanIds: [],
        status: 'ACTIVE',
      };

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [durationMinutes, setDurationMinutes] = useState(String(initial.durationMinutes));
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [minAttendance, setMinAttendance] = useState(
    initial.minAttendance === null ? '' : String(initial.minAttendance),
  );
  const [color, setColor] = useState(initial.color);
  const [pricingRule, setPricingRule] = useState<ClassPricingRule>(initial.pricingRule);
  const [price, setPrice] = useState(minorToMajor(initial.priceMinor));
  const [includedPlanIds, setIncludedPlanIds] = useState<string[]>(initial.includedPlanIds);
  const [status, setStatus] = useState<ClassTypeStatus>(initial.status);

  const togglePlan = (id: string) =>
    setIncludedPlanIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const profile = {
      name,
      description,
      durationMinutes: Number(durationMinutes),
      capacity: Number(capacity),
      minAttendance: minAttendance.trim() === '' ? null : Number(minAttendance),
      color,
      pricingRule,
      priceMinor: pricingRule === 'PAID' ? majorToMinor(price) : null,
      includedPlanIds: pricingRule === 'INCLUDED' ? includedPlanIds : [],
      status,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateClassTypeAction(props.typeId, profile)
        : await createClassTypeAction(profile);
      if (result.ok) {
        router.refresh();
        props.onSuccess?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="ct-name" {...stylex.props(styles.label)}>
          Name
        </label>
        <input
          id="ct-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Boxing"
          required
          {...stylex.props(styles.field)}
        />
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="ct-description" {...stylex.props(styles.label)}>
          Description <span {...stylex.props(styles.labelOptional)}>(optional)</span>
        </label>
        <textarea
          id="ct-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the class…"
          {...stylex.props(styles.textarea)}
        />
      </div>

      <div {...stylex.props(styles.row)}>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="ct-duration" {...stylex.props(styles.label)}>
            Duration (minutes)
          </label>
          <input
            id="ct-duration"
            type="number"
            min={1}
            inputMode="numeric"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="60"
            {...stylex.props(styles.field)}
          />
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="ct-capacity" {...stylex.props(styles.label)}>
            Max capacity
          </label>
          <input
            id="ct-capacity"
            type="number"
            min={1}
            inputMode="numeric"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            placeholder="20"
            {...stylex.props(styles.field)}
          />
        </div>
        <div {...stylex.props(styles.colFlex)}>
          <label htmlFor="ct-min" {...stylex.props(styles.label)}>
            Min attendance <span {...stylex.props(styles.labelOptional)}>(optional)</span>
          </label>
          <input
            id="ct-min"
            type="number"
            min={0}
            inputMode="numeric"
            value={minAttendance}
            onChange={(e) => setMinAttendance(e.target.value)}
            placeholder="e.g. 5"
            {...stylex.props(styles.field)}
          />
        </div>
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <span {...stylex.props(styles.label)}>Color</span>
        <div {...stylex.props(styles.swatches)}>
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Colour ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => setColor(swatch)}
              {...stylex.props(styles.swatch, color === swatch && styles.swatchActive)}
              style={{ backgroundColor: swatch }}
            />
          ))}
        </div>
      </div>

      <div {...stylex.props(styles.pricingBox)}>
        <div {...stylex.props(styles.fieldGroup)}>
          <label htmlFor="ct-pricing" {...stylex.props(styles.label)}>
            Pricing rule
          </label>
          <select
            id="ct-pricing"
            value={pricingRule}
            onChange={(e) => setPricingRule(e.target.value as ClassPricingRule)}
            {...stylex.props(styles.field)}
          >
            <option value="FREE">Free — included in all memberships</option>
            <option value="INCLUDED">Included in selected plans</option>
            <option value="PAID">Paid per session</option>
          </select>
        </div>

        {pricingRule === 'PAID' ? (
          <div {...stylex.props(styles.fieldGroup)}>
            <label htmlFor="ct-price" {...stylex.props(styles.label)}>
              Price per session
            </label>
            <input
              id="ct-price"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
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
                      {active ? (
                        <Icon name="check" sw={2.5} {...stylex.props(styles.planChipIcon)} />
                      ) : null}
                      {plan.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div {...stylex.props(styles.fieldGroup)}>
        <label htmlFor="ct-status" {...stylex.props(styles.label)}>
          Status
        </label>
        <select
          id="ct-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ClassTypeStatus)}
          {...stylex.props(styles.field)}
        >
          {STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
          label={pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add class type'}
        />
        {props.onCancel ? (
          <button type="button" onClick={props.onCancel} {...stylex.props(styles.cancelButton)}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
