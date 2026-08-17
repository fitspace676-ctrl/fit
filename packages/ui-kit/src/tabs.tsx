'use client';

import { useRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { focus } from './tokens';

/**
 * A tab strip over swapped panels.
 *
 * Distinct from {@link SegmentedControl}, which looks similar and means something
 * else: a segmented control picks a VALUE (light or dark, list or calendar) and
 * is a `radiogroup`; tabs pick a VIEW and own the region below them, which is why
 * each tab is `aria-controls`-bound to a `tabpanel` and the panel is labelled
 * back by its tab. Using one for the other leaves a screen reader announcing a
 * setting where there is a section, or the reverse.
 *
 * Same roving-tabindex mechanics as the segmented control: one tab stop for the
 * whole strip, arrows to move within it.
 *
 * The visual is an underline rather than a filled pill, so a tab strip cannot be
 * mistaken for the lime-filled segmented control sitting a few hundred pixels
 * away in the same page.
 */

const styles = stylex.create({
  list: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    // The strip scrolls rather than wrapping: a wrapped second row of tabs stops
    // reading as one control, and Georgian section names are long.
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tab: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
    height: '2.75rem',
    borderWidth: 0,
    borderTopLeftRadius: 'var(--radius-inner)',
    borderTopRightRadius: 'var(--radius-inner)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    paddingInline: '0.875rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  selected: {
    color: 'var(--color-text-primary)',
  },
  // Drawn as a child rather than as a bottom border, so it can sit ON the strip's
  // own 1px rule instead of adding a second line beneath it.
  underline: {
    position: 'absolute',
    insetInline: '0.5rem',
    bottom: '-1px',
    height: '2px',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
  },
  panel: {
    marginTop: '1.5rem',
    outline: 'none',
  },
});

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps<T extends string> {
  /** Accessible name for the strip. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: readonly TabItem<T>[];
  /** The selected tab's panel. */
  children: ReactNode;
  /** A stable prefix for the tab/panel id pairing. */
  idPrefix: string;
  xstyle?: StyleXStyles;
}

export function Tabs<T extends string>({
  label,
  value,
  onChange,
  items,
  children,
  idPrefix,
  xstyle,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function move(delta: number): void {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;
    const next = items[(index + delta + items.length) % items.length]!;
    onChange(next.value);
    listRef.current?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${next.value}`)?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        onChange(items[0]!.value);
        break;
      case 'End':
        event.preventDefault();
        onChange(items[items.length - 1]!.value);
        break;
      default:
        break;
    }
  }

  return (
    <div {...stylex.props(xstyle)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        {...stylex.props(styles.list)}
      >
        {items.map((item) => {
          const isSelected = item.value === value;
          return (
            <button
              key={item.value}
              id={`${idPrefix}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${idPrefix}-panel-${item.value}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(item.value)}
              {...stylex.props(styles.tab, isSelected ? styles.selected : styles.idle, focus.ring)}
            >
              {item.icon}
              {item.label}
              {isSelected ? <span aria-hidden {...stylex.props(styles.underline)} /> : null}
            </button>
          );
        })}
      </div>

      <div
        id={`${idPrefix}-panel-${value}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${value}`}
        // Focusable so a reader Tabbing off the strip lands in the panel it just
        // selected rather than skipping over non-interactive content entirely.
        tabIndex={0}
        {...stylex.props(styles.panel)}
      >
        {children}
      </div>
    </div>
  );
}
