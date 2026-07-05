'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export interface TabItem {
  /** Stable value reported through `onValueChange` / matched against `value`. */
  value: string;
  /** Visible label. */
  label: ReactNode;
  /** Optional leading icon. */
  icon?: IconName;
}

export interface TabsProps {
  /** The tabs to render, in order. */
  items: TabItem[];
  /** Controlled active value. Omit to let the component own the selection. */
  value?: string;
  /** Initial value in uncontrolled mode. Defaults to the first item. */
  defaultValue?: string;
  /** Fired with the newly selected value on every tab activation. */
  onValueChange?: (value: string) => void;
  /** Accessible name for the tablist. */
  'aria-label'?: string;
  className?: string;
}

/**
 * The underline tab bar shared by the detail screens (member / trainer detail):
 * a horizontally-scrollable `role="tablist"` of buttons with a brand underline
 * on the active tab. Works controlled (`value` + `onValueChange`) or uncontrolled
 * (`defaultValue`). It renders only the tab header — screens own their panels —
 * so it drops into the existing `active`-state layouts unchanged.
 *
 * Keyboard: follows the WAI-ARIA tabs pattern with automatic activation — only
 * the active tab is in the tab order (roving `tabindex`), and Left/Right (Home/
 * End) move focus between tabs and select as they go, so arrow keys navigate the
 * bar instead of Tab stepping through every tab.
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  'aria-label': ariaLabel,
  className = '',
}: TabsProps) {
  const [internal, setInternal] = useState(() => defaultValue ?? items[0]?.value ?? '');
  const active = value ?? internal;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    onValueChange?.(next);
  };

  // Move focus + selection to the tab at `index`, wrapping at the ends.
  const focusTab = (index: number) => {
    const count = items.length;
    if (count === 0) return;
    const wrapped = ((index % count) + count) % count;
    const tab = items[wrapped];
    if (!tab) return;
    tabRefs.current[wrapped]?.focus();
    select(tab.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTab(0);
        break;
      case 'End':
        event.preventDefault();
        focusTab(items.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-1 overflow-x-auto border-b border-ink-200 dark:border-white/10 ${className}`}
    >
      {items.map((tab, index) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => select(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
              isActive
                ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}
          >
            {tab.icon ? <Icon name={tab.icon} className="h-4 w-4" sw={2} /> : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
