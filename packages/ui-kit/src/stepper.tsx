'use client';

import { useId } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
import { focus, text } from './tokens';

/**
 * A count with a minus and a plus — cart quantities, a freeze in days.
 *
 * The lime is on the PLUS alone. Increment is the action the shop wants; minus
 * is its quiet counterpart, and painting both would spend the accent on a pair
 * of arrows rather than on a direction.
 *
 * The count is `aria-live="polite"` and the buttons carry real labels, so a
 * screen reader hears "3" after a press rather than nothing at all — a stepper
 * whose only feedback is a visual number is silent to anyone not looking at it.
 *
 * `min`/`max` disable the ends rather than hiding them, so the control keeps its
 * width and the row does not reflow as the count reaches a boundary.
 */

const styles = stylex.create({
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.125rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  groupSm: { padding: '0.1875rem' },
  groupMd: { padding: '0.25rem' },
  button: {
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  buttonSm: { height: '1.75rem', width: '1.75rem' },
  buttonMd: { height: '2.25rem', width: '2.25rem' },
  quiet: {
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  accent: {
    backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--fc-accent-hover)' },
    color: 'var(--color-on-accent)',
  },
  disabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  count: {
    textAlign: 'center',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  countSm: { minWidth: '1.25rem', fontSize: '0.8125rem' },
  countMd: { minWidth: '1.5rem', fontSize: '0.9375rem' },
  glyphSm: { height: '0.875rem', width: '0.875rem' },
  glyphMd: { height: '1.0625rem', width: '1.0625rem' },

  /* ------------------------------ labelled ------------------------------- */
  field: { display: 'block' },
  labelRow: { marginBottom: '0.5rem', display: 'block' },
  description: {
    display: 'block',
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
});

export type StepperSize = 'sm' | 'md';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  /** @default 0 */
  min?: number;
  max?: number;
  /** @default 'md' */
  size?: StepperSize;
  /** Accessible names — from the caller's i18n catalogue. */
  labels: { decrease: string; increase: string; value: string };
  /**
   * Replaces the minus glyph when the value is at `min + 1`, so pressing it once
   * more removes the line rather than stepping to zero. The cart's case.
   */
  removeAtMin?: boolean;
  disabled?: boolean;
  xstyle?: StyleXStyles;
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  size = 'md',
  labels,
  removeAtMin = false,
  disabled = false,
  xstyle,
}: StepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;
  const showRemove = removeAtMin && value === min + 1;

  const glyph = size === 'sm' ? styles.glyphSm : styles.glyphMd;
  const button = size === 'sm' ? styles.buttonSm : styles.buttonMd;

  return (
    <div {...stylex.props(styles.group, size === 'sm' ? styles.groupSm : styles.groupMd, xstyle)}>
      <button
        type="button"
        aria-label={labels.decrease}
        disabled={disabled || (atMin && !showRemove)}
        onClick={() => onChange(value - 1)}
        {...stylex.props(
          styles.button,
          button,
          styles.quiet,
          (disabled || (atMin && !showRemove)) && styles.disabled,
          focus.ring,
        )}
      >
        <Icon name={showRemove ? 'trash' : 'minus'} sw={2} {...stylex.props(glyph)} />
      </button>

      <span
        aria-live="polite"
        aria-label={labels.value}
        {...stylex.props(
          styles.count,
          text.numeral,
          size === 'sm' ? styles.countSm : styles.countMd,
        )}
      >
        {value}
      </span>

      <button
        type="button"
        aria-label={labels.increase}
        disabled={disabled || atMax}
        onClick={() => onChange(value + 1)}
        {...stylex.props(
          styles.button,
          button,
          styles.accent,
          (disabled || atMax) && styles.disabled,
          focus.ring,
        )}
      >
        <Icon name="plus" sw={2} {...stylex.props(glyph)} />
      </button>
    </div>
  );
}

export interface NumberFieldProps extends Omit<StepperProps, 'xstyle'> {
  label: string;
  description?: string;
  xstyle?: StyleXStyles;
}

/** A {@link Stepper} under the kit's micro-label, for use inside a form. */
export function NumberField({ label, description, xstyle, ...stepper }: NumberFieldProps) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field, xstyle)}>
      <span id={`${id}-label`} {...stylex.props(styles.labelRow, text.micro)}>
        {label}
      </span>
      <Stepper {...stepper} />
      {description ? <span {...stylex.props(styles.description)}>{description}</span> : null}
    </div>
  );
}
