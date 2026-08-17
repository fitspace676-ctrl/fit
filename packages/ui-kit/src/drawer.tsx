'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
import { Button } from './button';
import { text } from './tokens';
import { useDismissable } from './use-dismissable';

/**
 * A sheet that arrives from an edge — the class detail, and anything else too
 * long for a dialog and too secondary for a page.
 *
 * Modal, with the same guarantees as {@link Dialog}. What differs is the shape:
 * it takes a full edge of the viewport, so on a phone it comes up from the
 * BOTTOM (where a thumb is) and on a wide screen in from the SIDE (where there
 * is room beside the content it came from). That is one component with a media
 * query rather than two, because the content and the behaviour are identical and
 * only the axis changes.
 *
 * This replaces `@fit/ui-web`'s `Drawer`, which the class screens were still
 * mounting. That one is Tailwind-authored and exempt from the migration
 * guardrail, so a screen counted as migrated was still painting a Tailwind
 * overlay — the last piece of the old system inside the new one.
 */

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const slideUp = stylex.keyframes({
  from: { transform: 'translateY(100%)' },
  to: { transform: 'translateY(0)' },
});

const slideIn = stylex.keyframes({
  from: { transform: 'translateX(100%)' },
  to: { transform: 'translateX(0)' },
});

const fadeOut = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const slideDown = stylex.keyframes({
  from: { transform: 'translateY(0)' },
  to: { transform: 'translateY(100%)' },
});

const slideOut = stylex.keyframes({
  from: { transform: 'translateX(0)' },
  to: { transform: 'translateX(100%)' },
});

/**
 * How long the sheet keeps rendering after `open` goes false, so it can animate
 * out. Must match the exit animation's duration below — a shorter timer clips
 * the animation, a longer one leaves a frozen sheet on screen.
 */
const EXIT_MS = 200;

const styles = stylex.create({
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'flex',
    alignItems: {
      default: 'flex-end',
      '@media (min-width: 640px)': 'stretch',
    },
    justifyContent: 'flex-end',
    backgroundColor: 'var(--color-overlay)',
    animationName: fadeIn,
    animationDuration: '150ms',
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
  scrimExiting: {
    animationName: fadeOut,
    animationDuration: '200ms',
    animationFillMode: 'forwards',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    width: {
      default: '100%',
      '@media (min-width: 640px)': 'min(28rem, 100vw)',
    },
    maxHeight: {
      default: '88vh',
      '@media (min-width: 640px)': '100vh',
    },
    backgroundColor: 'var(--color-background-card)',
    // Rounded on the arriving edge only — the sheet is flush with the viewport
    // on the other three, and rounding those would float it for no reason.
    borderStartStartRadius: 'var(--radius-page)',
    borderStartEndRadius: {
      default: 'var(--radius-page)',
      '@media (min-width: 640px)': 0,
    },
    borderEndStartRadius: {
      default: 0,
      '@media (min-width: 640px)': 0,
    },
    boxShadow: 'var(--shadow-high)',
    outline: 'none',
    animationName: {
      default: slideUp,
      '@media (min-width: 640px)': slideIn,
    },
    animationDuration: '220ms',
    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
  // Leaves along the axis it arrived on. Without this the sheet vanished on the
  // frame `open` went false — an entrance that is animated and an exit that is
  // not reads as a dropped frame rather than as restraint.
  panelExiting: {
    animationName: {
      default: slideDown,
      '@media (min-width: 640px)': slideOut,
    },
    animationDuration: '200ms',
    animationTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
    animationFillMode: 'forwards',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexShrink: 0,
    paddingInline: '1.5rem',
    paddingTop: '1.5rem',
    paddingBottom: '1rem',
  },
  title: {
    fontSize: '1.375rem',
  },
  // Only the body scrolls, so the header and footer stay put while a long class
  // description or message runs past the fold.
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingInline: '1.5rem',
    paddingBottom: '1.5rem',
  },
  footer: {
    flexShrink: 0,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingInline: '1.5rem',
    paddingTop: '1rem',
    // Clears the iOS home indicator on the bottom-sheet layout.
    paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
  },
  bodyLast: {
    paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
  },
  closeIcon: {
    height: '1.125rem',
    width: '1.125rem',
  },
});

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** The sheet's accessible name. Also the visible heading unless `hideHeader`. */
  label: string;
  /**
   * Accessible name for the close button — from the caller's i18n catalogue.
   * Only read when the built-in header renders, so a caller passing `hideHeader`
   * may omit it along with the button it names.
   */
  closeLabel?: string;
  children: ReactNode;
  /**
   * Actions pinned to the foot of the sheet, outside the scrolling body — a
   * cancel/send pair on a form. Pinned rather than scrolled because a long
   * message body would otherwise push the send button past the fold, and the
   * whole reason for a sheet is that the action stays in reach.
   */
  footer?: ReactNode;
  /**
   * Suppress the built-in header when the content draws its own. The close
   * button goes with it, so a caller that hides the header owns providing one.
   */
  hideHeader?: boolean;
  /**
   * Whether Escape and a click on the scrim may close it. Set false while a
   * write is in flight — see `useDismissable`.
   *
   * @default true
   */
  dismissible?: boolean;
  xstyle?: StyleXStyles;
}

export function Drawer({
  open,
  onClose,
  label,
  closeLabel,
  children,
  footer,
  hideHeader = false,
  dismissible = true,
  xstyle,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  // Keeps the sheet mounted through its exit animation. `open` is still the
  // single source of truth — this only delays the unmount, so every behaviour
  // keyed to `open` (focus restore, scroll unlock, Escape) fires immediately
  // while the pixels catch up.
  const [exiting, setExiting] = useState(false);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      setExiting(true);
      const timer = setTimeout(() => setExiting(false), EXIT_MS);
      wasOpen.current = open;
      return () => clearTimeout(timer);
    }
    wasOpen.current = open;
    return undefined;
  }, [open]);

  useDismissable({ open, onClose, ref: panelRef, trap: true, lockScroll: true, dismissible });

  if (!open && !exiting) return null;

  return (
    <div {...stylex.props(styles.scrim, !open && styles.scrimExiting)}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? label : undefined}
        aria-labelledby={hideHeader ? undefined : `${id}-title`}
        tabIndex={-1}
        // Not interactive on the way out: the focus trap has already released
        // and the actions are mid-slide, so a click here would land on a control
        // the reader can no longer see.
        {...(open ? {} : { 'aria-hidden': true, inert: true })}
        {...stylex.props(styles.panel, !open && styles.panelExiting, xstyle)}
      >
        {hideHeader ? null : (
          <div {...stylex.props(styles.header)}>
            <h2 id={`${id}-title`} {...stylex.props(text.heading, styles.title)}>
              {label}
            </h2>
            <Button
              variant="ghost"
              size="card"
              iconOnly
              label={closeLabel ?? label}
              onClick={onClose}
              icon={<Icon name="x" sw={2.1} {...stylex.props(styles.closeIcon)} />}
            />
          </div>
        )}
        <div {...stylex.props(styles.body, !footer && styles.bodyLast)}>{children}</div>
        {footer ? <div {...stylex.props(styles.footer)}>{footer}</div> : null}
      </div>
    </div>
  );
}
