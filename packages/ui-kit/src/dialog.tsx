'use client';

import { useId, useRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Button, type ButtonVariant } from './button';
import { text } from './tokens';
import { useDismissable } from './use-dismissable';

/**
 * A modal panel: a scrim over the page and a card centred on it.
 *
 * Modal in the full sense — focus moves in, Tab is trapped, the page behind is
 * scroll-locked, Escape and a click on the scrim both close, and focus returns
 * to whatever opened it. All of that comes from {@link useDismissable}; what is
 * here is the surface.
 *
 * The panel is a plain `<div role="dialog">` rather than a `<dialog>` element:
 * the native one is genuinely better at this, but its `::backdrop` cannot be
 * animated in step with the panel across browsers, and Astryx's reset already
 * strips the element's padding and outline for its own dialog — two conflicting
 * owners of the same tag. A div with the ARIA is the arrangement the rest of the
 * kit can reason about.
 */

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const riseIn = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
});

const styles = stylex.create({
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    display: 'grid',
    placeItems: 'center',
    padding: '1.5rem',
    backgroundColor: 'var(--color-overlay)',
    animationName: fadeIn,
    animationDuration: '150ms',
    // A reader who asked for less motion gets the panel, not the arrival.
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
  panel: {
    width: '100%',
    maxWidth: '26rem',
    // The panel scrolls inside itself rather than growing past the viewport, so
    // the actions at its foot stay reachable however long the description runs.
    maxHeight: 'calc(100vh - 3rem)',
    overflowY: 'auto',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-card)',
    padding: '1.5rem',
    boxShadow: 'var(--shadow-high)',
    outline: 'none',
    animationName: riseIn,
    animationDuration: '180ms',
    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '@media (prefers-reduced-motion: reduce)': { animationName: 'none' },
  },
  title: {
    fontSize: '1.25rem',
  },
  description: {
    margin: 0,
    marginTop: '0.625rem',
    fontSize: '0.875rem',
    lineHeight: 1.6,
    color: 'var(--color-text-secondary)',
  },
  body: {
    marginTop: '1.25rem',
  },
  // The confirming action sits at the END of the row. A destructive action is
  // the one a reader should have to travel to, not the one their thumb rests on.
  actions: {
    marginTop: '1.5rem',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
  },
});

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * A ReactNode rather than a string: a confirmation often names the record it
   * is about, and that name earns emphasis ("Delete **Whey Protein 1kg**?").
   * Still announced as the dialog's description via `aria-describedby`.
   */
  description?: ReactNode;
  children?: ReactNode;
  /** The action row. Usually two `Button`s. */
  actions?: ReactNode;
  /**
   * Whether Escape and a click on the scrim may close it. Set false while a
   * write is in flight — see `useDismissable`.
   *
   * @default true
   */
  dismissible?: boolean;
  xstyle?: StyleXStyles;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  dismissible = true,
  xstyle,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useDismissable({ open, onClose, ref: panelRef, trap: true, lockScroll: true, dismissible });

  if (!open) return null;

  return (
    <div {...stylex.props(styles.scrim)}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        {...stylex.props(styles.panel, xstyle)}
      >
        <h2 id={`${id}-title`} {...stylex.props(text.heading, styles.title)}>
          {title}
        </h2>
        {description ? (
          <p id={`${id}-desc`} {...stylex.props(styles.description)}>
            {description}
          </p>
        ) : null}
        {children ? <div {...stylex.props(styles.body)}>{children}</div> : null}
        {actions ? <div {...stylex.props(styles.actions)}>{actions}</div> : null}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
  /** @default 'primary' */
  confirmVariant?: ButtonVariant;
  /** Keeps the dialog open with a spinner while the action is in flight. */
  loading?: boolean;
}

/**
 * The "are you sure" case, which is most of them.
 *
 * While `loading`, the dialog refuses to close: the cancel button goes disabled
 * and `onClose` is not wired to the scrim or Escape. A confirmation that can be
 * dismissed mid-flight leaves the reader with no idea whether the thing they
 * confirmed actually happened.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
  confirmVariant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      description={description}
      actions={
        <>
          <Button
            variant="ghost"
            size="block"
            label={cancelLabel}
            onClick={onClose}
            disabled={loading}
          />
          <Button
            variant={confirmVariant}
            size="block"
            label={confirmLabel}
            onClick={onConfirm}
            loading={loading}
          />
        </>
      }
    />
  );
}
