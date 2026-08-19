'use client';

import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';

/**
 * A checkbox on the FormaCore silhouette.
 *
 * The native control cannot be styled to the direction: browsers paint it in the
 * OS accent (a system blue on most machines), which is a second chromatic voice
 * in a palette that allows exactly one — and it is the single most repeated
 * control in the console, sitting in the leading column of every list.
 *
 * So the real `<input>` stays, visually hidden but fully present: it keeps the
 * label association, the keyboard behaviour, the form value and the indeterminate
 * state, and a `<span>` beside it draws the box. Everything a screen reader and a
 * keyboard see is the native control; only the pixels are ours.
 */

const styles = stylex.create({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.625rem',
    cursor: 'pointer',
  },
  disabledRoot: {
    cursor: 'not-allowed',
    opacity: 0.55,
  },
  /**
   * The input is stretched over the box rather than clipped away to 1px: at zero
   * size some browsers refuse to scroll it into view on focus, and the focus ring
   * we draw on the box would then appear off-screen with nothing to point at.
   */
  input: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    margin: 0,
    opacity: 0,
    cursor: 'inherit',
  },
  box: {
    // The box is also the positioning context, so the input can sit INSIDE it
    // rather than beside it — which is what makes `:has(:focus-visible)` below
    // match. As siblings the selector cannot see across, and the ring never
    // paints.
    position: 'relative',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    height: '1.125rem',
    width: '1.125rem',
    // The `inner` step, not a pill: a round checkbox reads as a radio.
    borderRadius: '0.375rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-on-accent)',
    transitionProperty: 'background-color, border-color, box-shadow',
    transitionDuration: '150ms',
    /**
     * The ring is drawn HERE but earned by the input inside, so it cannot be the
     * kit's `focus.ring` fragment: that keys off `:focus-visible` on the element
     * it styles, and this `<span>` never receives focus — the visually-hidden
     * `<input>` over it does. `:has(:focus-visible)` moves the condition inward
     * while keeping the paint on the visible box.
     *
     * `:focus-within` would be the older spelling and is wrong here: it fires on
     * a mouse click too, leaving a ring behind after every toggle.
     */
    boxShadow: { default: null, ':has(:focus-visible)': 'var(--fc-focus-ring)' },
  },
  boxOn: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
  },
  glyph: {
    height: '0.8125rem',
    width: '0.8125rem',
  },
  /** The indeterminate bar — a header checkbox over a partly-selected page. */
  dash: {
    height: '2px',
    width: '0.5rem',
    borderRadius: '1px',
    backgroundColor: 'var(--color-on-accent)',
  },
  label: {
    minWidth: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
});

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'id' | 'type' | 'children'
> {
  /**
   * The accessible name. Rendered beside the box unless `labelHidden` — a table's
   * row checkbox has no room for one but still must be named.
   */
  label: string;
  labelHidden?: boolean;
  checked: boolean;
  /** Neither on nor off — a "select all" over a partial page. */
  indeterminate?: boolean;
  /** Rendered instead of the plain label text. */
  children?: ReactNode;
  xstyle?: StyleXStyles;
}

export function Checkbox({
  label,
  labelHidden = false,
  checked,
  indeterminate = false,
  disabled = false,
  children,
  xstyle,
  ...rest
}: CheckboxProps) {
  const id = useId();

  return (
    <label htmlFor={id} {...stylex.props(styles.root, disabled && styles.disabledRoot, xstyle)}>
      <span {...stylex.props(styles.box, (checked || indeterminate) && styles.boxOn)}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          // `aria-checked="mixed"` is what actually announces the third state;
          // the DOM `indeterminate` property is visual-only and cannot be set
          // from JSX, which is why this is an ARIA attribute rather than a ref.
          aria-checked={indeterminate ? 'mixed' : checked}
          aria-label={labelHidden ? label : undefined}
          {...rest}
          {...stylex.props(styles.input)}
        />
        {indeterminate ? (
          <span aria-hidden {...stylex.props(styles.dash)} />
        ) : checked ? (
          <Icon name="check" sw={3} aria-hidden {...stylex.props(styles.glyph)} />
        ) : null}
      </span>
      {labelHidden ? null : <span {...stylex.props(styles.label)}>{children ?? label}</span>}
    </label>
  );
}
