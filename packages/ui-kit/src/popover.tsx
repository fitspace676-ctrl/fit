'use client';

import { useRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { useDismissable } from './use-dismissable';

/**
 * A panel anchored to its trigger.
 *
 * POSITIONED IN CSS, NOT IN JAVASCRIPT. The panel is absolutely placed against a
 * `position: relative` wrapper that also holds the trigger, so there is no
 * measure-then-place pass and therefore no frame where the panel is painted in
 * the wrong spot before it is corrected. The portal's two popovers — the
 * notification inbox and the account menu — both hang off chrome pinned to a
 * screen edge, where the anchor never moves and a collision detector would have
 * nothing to detect.
 *
 * NOT MODAL, deliberately. Tab moves out of the panel and on into the page,
 * because a popover does not claim the screen the way a dialog does — so
 * `trap` is off and only Escape, a click outside, or Tabbing away closes it.
 * The scroll behind stays live for the same reason.
 */

const styles = stylex.create({
  wrap: {
    position: 'relative',
    display: 'inline-flex',
  },
  panel: {
    position: 'absolute',
    zIndex: 50,
    maxWidth: 'calc(100vw - 2rem)',
    overflow: 'hidden',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-popover)',
    // Floating chrome is the one thing the direction lets carry elevation.
    boxShadow: 'var(--shadow-high)',
    outline: 'none',
  },
  // `bottom: 100%` rather than a translate, so the gap is the margin and the
  // panel grows upward from the trigger however tall its content turns out.
  above: {
    bottom: '100%',
    marginBottom: '0.625rem',
  },
  below: {
    top: '100%',
    marginTop: '0.625rem',
  },
  alignStart: {
    insetInlineStart: 0,
  },
  alignEnd: {
    insetInlineEnd: 0,
  },
});

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** The control that opens it. Rendered inside the anchor, above the panel. */
  trigger: ReactNode;
  children: ReactNode;
  /** Accessible name for the panel. */
  label: string;
  /** @default 'below' */
  placement?: 'above' | 'below';
  /** Which edge the panel lines up with. @default 'end' */
  align?: 'start' | 'end';
  /** Fixed panel width in pixels; otherwise it sizes to its content. */
  width?: number;
  xstyle?: StyleXStyles;
}

export function Popover({
  open,
  onClose,
  trigger,
  children,
  label,
  placement = 'below',
  align = 'end',
  width,
  xstyle,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The wrapper — not the panel — is the dismiss boundary, so a second click on
  // the trigger is "inside" and reaches the trigger's own toggle rather than
  // being eaten as an outside-click that closes and immediately reopens.
  const wrapRef = useRef<HTMLDivElement>(null);

  useDismissable({ open, onClose, ref: wrapRef, focusRef: panelRef });

  return (
    <div ref={wrapRef} {...stylex.props(styles.wrap)}>
      {trigger}
      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          style={width ? { width } : undefined}
          {...stylex.props(
            styles.panel,
            placement === 'above' ? styles.above : styles.below,
            align === 'end' ? styles.alignEnd : styles.alignStart,
            xstyle,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
