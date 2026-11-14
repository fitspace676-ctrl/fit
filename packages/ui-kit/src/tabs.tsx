'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
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

/** How far the strip's edge fade reaches, and so how much of a cut-off tab shows. */
const FADE = '3rem';

const styles = stylex.create({
  strip: { position: 'relative' },
  list: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    // The strip scrolls rather than wrapping: a wrapped second row of tabs stops
    // reading as one control, and Georgian section names are long. The fade and
    // arrows below make the overflow visible.
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    // The scrollbar is replaced by the edge fade and arrows below: on a trackpad
    // it is invisible until scrolled, which is exactly when it is no longer needed.
    scrollbarWidth: 'none',
    '::-webkit-scrollbar': { display: 'none' },
  },
  // A strip with more tabs than fit fades out at the edge that hides some, so the
  // cut-off tab reads as "more this way" rather than as the end of the row. A mask
  // rather than a painted gradient, so it works on a card as well as on the page.
  fadeEnd: {
    maskImage: `linear-gradient(to right, black calc(100% - ${FADE}), transparent)`,
  },
  fadeStart: {
    maskImage: `linear-gradient(to left, black calc(100% - ${FADE}), transparent)`,
  },
  fadeBoth: {
    maskImage: `linear-gradient(to right, transparent, black ${FADE}, black calc(100% - ${FADE}), transparent)`,
  },
  arrow: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'grid',
    placeItems: 'center',
    height: '1.75rem',
    width: '1.75rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-popover)',
      ':hover': 'var(--color-background-muted)',
    },
    color: 'var(--color-text-primary)',
    padding: 0,
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
  },
  arrowStart: { insetInlineStart: 0 },
  arrowEnd: { insetInlineEnd: 0 },
  arrowIcon: { height: '0.875rem', width: '0.875rem' },
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
    backgroundImage: 'var(--brand-fill-image, none)',
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
  // Which edges have tabs hidden past them. Measured, not guessed: whether the
  // strip overflows depends on the labels' language and the column it sits in.
  const [hidden, setHidden] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const max = list.scrollWidth - list.clientWidth;
    setHidden({ start: list.scrollLeft > 1, end: list.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(list);
    list.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer?.disconnect();
      list.removeEventListener('scroll', measure);
    };
  }, [measure]);

  // The selected tab is always brought into view, so a tab chosen by keyboard (or
  // one restored on load) is never selected off-screen. Only the strip scrolls:
  // `scrollIntoView` would also move the page to reach a strip below the fold.
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLButtonElement>(
      `#${CSS.escape(`${idPrefix}-tab-${value}`)}`,
    );
    if (!list || !tab) return;
    // The tab's edges in the strip's scroll coordinates.
    const start =
      tab.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    const end = start + tab.getBoundingClientRect().width;
    if (start < list.scrollLeft) {
      list.scrollTo({ left: start, behavior: 'smooth' });
    } else if (end > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: end - list.clientWidth, behavior: 'smooth' });
    }
  }, [value, idPrefix]);

  function scrollBy(direction: 1 | -1): void {
    const list = listRef.current;
    if (!list) return;
    list.scrollBy({ left: direction * list.clientWidth * 0.7, behavior: 'smooth' });
  }

  const fade =
    hidden.start && hidden.end
      ? styles.fadeBoth
      : hidden.end
        ? styles.fadeEnd
        : hidden.start
          ? styles.fadeStart
          : null;

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
      <div {...stylex.props(styles.strip)}>
        <div
          ref={listRef}
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          {...stylex.props(styles.list, fade)}
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
                {...stylex.props(
                  styles.tab,
                  isSelected ? styles.selected : styles.idle,
                  focus.ring,
                )}
              >
                {item.icon}
                {item.label}
                {isSelected ? <span aria-hidden {...stylex.props(styles.underline)} /> : null}
              </button>
            );
          })}
        </div>
        {/* Pointer affordances only: the strip is one tab stop and the arrow keys
          already move through it, so these stay out of the tab order. */}
        {hidden.start ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => scrollBy(-1)}
            {...stylex.props(styles.arrow, styles.arrowStart)}
          >
            <Icon name="chevronLeft" {...stylex.props(styles.arrowIcon)} />
          </button>
        ) : null}
        {hidden.end ? (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => scrollBy(1)}
            {...stylex.props(styles.arrow, styles.arrowEnd)}
          >
            <Icon name="chevronRight" {...stylex.props(styles.arrowIcon)} />
          </button>
        ) : null}
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
