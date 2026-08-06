'use client';

// Shared keyboard behaviour for a `role="tablist"` bar, per the WAI-ARIA
// tablist pattern with automatic activation: roving `tabindex` (only the
// active tab is a tab stop — Tab enters/exits the bar once), Left/Right (and
// Up/Down) move focus to the neighbour and select it, Home/End jump to the
// first/last tab, and every move wraps around both ends.
//
// Extracted from `segment-tabs.tsx` (the dashboard's own segment bar) so the
// "Add widget" picker's segment tab bar — the same tablist idea, one file
// away — honours the identical contract instead of announcing `role="tab"`
// and then leaving arrow keys dead. One shared implementation; callers still
// own rendering and styling.

import { useRef, type KeyboardEvent } from 'react';

export interface RovingTablist {
  /** Attach to each tab's `ref`, passing that tab's index. */
  registerRef: (index: number) => (el: HTMLButtonElement | null) => void;
  /** Attach to each tab's `onKeyDown`, passing that tab's index. */
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

export function useRovingTablist<T>(
  items: readonly T[],
  onSelect: (item: T) => void,
): RovingTablist {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Move focus and selection together, wrapping at both ends.
  const focusItem = (index: number): void => {
    const count = items.length;
    if (count === 0) return;
    const wrapped = ((index % count) + count) % count;
    const item = items[wrapped];
    if (item === undefined) return;
    itemRefs.current[wrapped]?.focus();
    onSelect(item);
  };

  const registerRef =
    (index: number) =>
    (el: HTMLButtonElement | null): void => {
      itemRefs.current[index] = el;
    };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      default:
        break;
    }
  };

  return { registerRef, onKeyDown };
}
