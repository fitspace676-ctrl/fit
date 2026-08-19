'use client';

import { useId } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { focus } from './tokens';

/**
 * An on/off control for a setting that takes effect immediately — notification
 * preferences, two-factor.
 *
 * `role="switch"`, not a checkbox: a checkbox is read as "will be applied when
 * you submit", a switch as "is on". Everything this control governs in the
 * portal saves on change, so the switch is the honest one.
 *
 * The whole row is the label, so the tap target is the row rather than the 44px
 * track — which is what makes it usable on a phone.
 */

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    paddingBlock: '0.625rem',
    cursor: 'pointer',
  },
  labelText: {
    minWidth: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  description: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  track: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    height: '1.625rem',
    width: '2.75rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    padding: 0,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  trackOff: {
    backgroundColor: 'var(--fc-quiet)',
  },
  trackOn: {
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
  },
  trackDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  // The knob is white in BOTH states and both modes: on the lime it has to be
  // ink-free to stay visible, and switching its colour with the state would make
  // the control read as two different objects.
  knob: {
    position: 'absolute',
    height: '1.25rem',
    width: '1.25rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 2px rgba(19, 19, 18, 0.3)',
    // `inset-inline-start` rather than `left`, so the knob travels the correct
    // way when the document is right-to-left.
    transitionProperty: 'inset-inline-start',
    transitionDuration: '150ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' },
  },
  knobOff: {
    insetInlineStart: '0.1875rem',
  },
  knobOn: {
    insetInlineStart: '1.3125rem',
  },
});

export interface SwitchProps {
  label: string;
  /** One line under the label on what the setting does. */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  xstyle?: StyleXStyles;
}

export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  xstyle,
}: SwitchProps) {
  const id = useId();

  return (
    <div {...stylex.props(styles.row, xstyle)}>
      <span>
        <label htmlFor={id} {...stylex.props(styles.labelText)}>
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} {...stylex.props(styles.description)}>
            {description}
          </p>
        ) : null}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        {...stylex.props(
          styles.track,
          checked ? styles.trackOn : styles.trackOff,
          disabled && styles.trackDisabled,
          focus.ring,
        )}
      >
        <span
          aria-hidden
          {...stylex.props(styles.knob, checked ? styles.knobOn : styles.knobOff)}
        />
      </button>
    </div>
  );
}
