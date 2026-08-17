'use client';

import { useRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { focus } from './tokens';

/**
 * A single choice among a few, all of them visible: list-or-calendar, light-or-
 * dark, ka-or-en.
 *
 * ARIA `radiogroup`, not a row of buttons. That distinction is the whole reason
 * this is a component rather than three styled `<button>`s: a radiogroup is ONE
 * tab stop, and the arrow keys move within it. A row of plain buttons makes a
 * keyboard user Tab past every option they did not want, and tells a screen
 * reader nothing about how many choices there are or which is current.
 *
 * ROVING TABINDEX is how that is implemented: exactly one option carries
 * `tabIndex={0}` — the selected one — and the rest carry `-1`, so Tab enters the
 * group at the current value and Tab again leaves it entirely.
 *
 * Arrow keys SELECT as they move, which is the standard for a radiogroup and is
 * right here: every option in this product is a cheap, instantly reversible view
 * change. It would be wrong for a group whose options commit something.
 */

const styles = stylex.create({
  group: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.25rem',
  },
  option: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.375rem',
    height: '2rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    paddingInline: '0.875rem',
    fontFamily: 'inherit',
    fontSize: '0.8125rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  // The selected option takes the lime. It is the only chromatic thing in the
  // control, which is what makes "where am I" readable at a glance.
  selected: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  /** Icon-only options (the theme toggle) — square, so the group stays a capsule. */
  square: {
    width: '2rem',
    paddingInline: 0,
  },
});

export interface SegmentedOption<T extends string> {
  value: T;
  /** The visible text, or the accessible name when `icon` is given alone. */
  label: string;
  icon?: ReactNode;
  /** Show the icon alone, with `label` as the accessible name. */
  iconOnly?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the group as a whole. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  xstyle?: StyleXStyles;
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  xstyle,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  function move(delta: number): void {
    const index = options.findIndex((option) => option.value === value);
    if (index < 0) return;
    // Wrap at both ends — a radiogroup is a ring, not a line.
    const next = options[(index + delta + options.length) % options.length]!;
    onChange(next.value);
    // Focus has to follow the selection, or the roving `tabIndex={0}` moves to
    // the newly selected option while the browser's focus stays on the old one —
    // and the next arrow key is read by an element that is no longer the entry
    // point. Queried by value so it survives the re-render that just happened.
    groupRef.current
      ?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(next.value)}"]`)
      ?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        onChange(options[0]!.value);
        break;
      case 'End':
        event.preventDefault();
        onChange(options[options.length - 1]!.value);
        break;
      default:
        break;
    }
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      {...stylex.props(styles.group, xstyle)}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            data-value={option.value}
            aria-checked={isSelected}
            aria-label={option.iconOnly ? option.label : undefined}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(option.value)}
            {...stylex.props(
              styles.option,
              option.iconOnly && styles.square,
              isSelected ? styles.selected : styles.idle,
              focus.ring,
            )}
          >
            {option.icon}
            {option.iconOnly ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}
