'use client';

// @fit/ui-web — overlay kit (T1.6).
//
// The shared modal / drawer primitives for the "formacore" Aurora-glass design,
// replacing the ad-hoc `fixed inset-0` panels each screen used to hand-roll:
//
//   • {@link Modal}         — a centred dialog surface (forms, detail cards).
//   • {@link ConfirmDialog} — the confirm/cancel pattern for destructive or
//                              irreversible actions, built on {@link Modal}.
//   • {@link Drawer}        — a side sheet for detail panes (class detail,
//                              order detail, filters …).
//
// All three share {@link Overlay}: a portalled backdrop that locks body scroll,
// closes on Esc / backdrop click, and traps the mount so the dialog is the only
// interactive surface. Pure class recipes live at the top so they can be unit
// tested (see overlay.spec.ts) without a DOM render.
//
// Astryx migration (T11.4): the action buttons render Astryx `<Button>` (via
// {@link Btn}). The scrim itself stays this bespoke primitive rather than moving
// onto Astryx's `Dialog`/`Overlay`: Astryx `Dialog` renders a native `<dialog>`
// (`showModal()`), which sheds the portalled `role="dialog"` surface, the custom
// Tab focus-trap, and the aria-hidden backdrop that this kit's contract is built
// on — so, per the Tailwind→Astryx coexistence, the panels stay Fit-theme
// brand-token surfaces (the `*PanelClasses` recipes) while the brand tokens
// (radii, ink/danger palette) already come from T11.1.

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Btn } from './button';

/* -------------------------------------------------------------------------- */
/*  Class recipes (pure — unit tested)                                          */
/* -------------------------------------------------------------------------- */

/** The dim + blur backdrop behind every overlay. */
export const OVERLAY_BACKDROP =
  'absolute inset-0 bg-ink-950/50 backdrop-blur-sm transition-opacity';

/** The scrim wrapper that fills the viewport and stacks above the app chrome. */
export const OVERLAY_ROOT = 'fixed inset-0 z-50';

/**
 * Selector for the elements a keyboard user can Tab to. Deliberately excludes
 * anything explicitly removed from the tab order (`tabindex="-1"`) so the
 * aria-hidden backdrop button never becomes a trap stop.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The tabbable descendants of `root`, in document order (empty when none). */
export function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.tabIndex !== -1 && el.getAttribute('aria-hidden') !== 'true',
  );
}

export type ModalSize = 'sm' | 'md' | 'lg';

const MODAL_WIDTHS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

const PANEL_SURFACE =
  'border border-ink-200 bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)] dark:border-white/10 dark:bg-ink-950';

/** Compose the centred modal panel classes for a given size. */
export function modalPanelClasses(size: ModalSize = 'md', className = ''): string {
  return `relative flex w-full ${MODAL_WIDTHS[size]} flex-col overflow-hidden rounded-card ${PANEL_SURFACE} ${className}`.trim();
}

export type DrawerSide = 'right' | 'left';

/** Compose the side-sheet panel classes for a given side. */
export function drawerPanelClasses(side: DrawerSide = 'right', className = ''): string {
  const anchor = side === 'right' ? 'right-0 border-l' : 'left-0 border-r';
  return `absolute inset-y-0 ${anchor} flex w-full max-w-md flex-col overflow-y-auto ${PANEL_SURFACE} ${className}`.trim();
}

/* -------------------------------------------------------------------------- */
/*  Overlay — shared behaviour (portal, scroll-lock, Esc, backdrop close)       */
/* -------------------------------------------------------------------------- */

export interface OverlayProps {
  /** Whether the overlay is mounted/visible. */
  open: boolean;
  /** Called on Esc, backdrop click, or the built-in close affordances. */
  onClose: () => void;
  /** Accessible label for the dialog (used when there is no visible heading). */
  label?: string;
  /** id of the element that labels the dialog (a visible heading). */
  labelledBy?: string;
  /** Disable closing when the backdrop is clicked (Esc still works). */
  disableBackdropClose?: boolean;
  /** The positioned panel — a {@link Modal} or {@link Drawer} body. */
  children: ReactNode;
  /** Extra classes for the scrim root (e.g. flex alignment for modals). */
  className?: string;
}

/**
 * The low-level scrim. Portals to `document.body`, locks page scroll while open,
 * closes on Escape, and renders the dim backdrop. Consumers position their own
 * panel inside `children`; {@link Modal} and {@link Drawer} do this for you.
 */
export function Overlay({
  open,
  onClose,
  label,
  labelledBy,
  disableBackdropClose = false,
  children,
  className = '',
}: OverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Focus trap: move focus into the dialog on open, keep Tab / Shift+Tab
  // cycling within it, and restore focus to the trigger when it closes. This is
  // what makes the dialog the only interactive surface while it is up.
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Land focus inside the dialog — the first control, or the panel itself.
    const initial = focusableElements(container);
    (initial[0] ?? container)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || !container) {
        return;
      }
      const items = focusableElements(container);
      if (items.length === 0) {
        // Nothing tabbable — keep focus pinned to the panel.
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !container.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    container?.addEventListener('keydown', onKeyDown);
    return () => {
      container?.removeEventListener('keydown', onKeyDown);
      // Restore focus to whatever opened the dialog.
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Lock body scroll while open so the page behind the scrim can't move.
  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={containerRef}
      tabIndex={-1}
      className={`${OVERLAY_ROOT} ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className={OVERLAY_BACKDROP}
        onClick={disableBackdropClose ? undefined : onClose}
      />
      {children}
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal — centred dialog                                                      */
/* -------------------------------------------------------------------------- */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Heading text; rendered as the dialog title and wired to `aria-labelledby`. */
  title?: string;
  /** Optional supporting line beneath the title. */
  description?: ReactNode;
  size?: ModalSize;
  /** Hide the top-right close button (e.g. blocking dialogs). */
  hideClose?: boolean;
  disableBackdropClose?: boolean;
  /** Footer actions row (buttons); rendered right-aligned. */
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

let modalSeq = 0;

/** A centred dialog surface. Compose forms/detail content as `children`. */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  hideClose = false,
  disableBackdropClose = false,
  footer,
  children,
  className = '',
}: ModalProps) {
  // Stable per-instance id so the title can label the dialog for a11y.
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    modalSeq += 1;
    idRef.current = `fit-modal-${modalSeq}`;
  }
  const titleId = title ? `${idRef.current}-title` : undefined;

  return (
    <Overlay
      open={open}
      onClose={onClose}
      label={title ? undefined : 'Dialog'}
      labelledBy={titleId}
      disableBackdropClose={disableBackdropClose}
      className="flex items-center justify-center p-4"
    >
      <div className={modalPanelClasses(size, className)}>
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="flex flex-col gap-1">
              {title && (
                <h2
                  id={titleId}
                  className="font-display text-lg font-extrabold tracking-tight text-ink-900 dark:text-white"
                >
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-ink-500 dark:text-ink-400">{description}</p>
              )}
            </div>
            {!hideClose && (
              <Btn v="ghost" size="icon" icon="x" aria-label="Close" onClick={onClose} />
            )}
          </div>
        )}

        {children && <div className="px-6 py-5">{children}</div>}

        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-ink-200 px-6 py-4 dark:border-white/10">
            {footer}
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* -------------------------------------------------------------------------- */
/*  ConfirmDialog — confirm / cancel                                            */
/* -------------------------------------------------------------------------- */

export interface ConfirmDialogProps {
  open: boolean;
  /** Called when the user cancels or dismisses. */
  onClose: () => void;
  /** Called when the user confirms. */
  onConfirm: () => void;
  title: string;
  /** Body copy explaining the consequence. */
  message?: ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Style the confirm action as destructive (red). */
  danger?: boolean;
  /** Disable buttons while an async confirm is in flight. */
  busy?: boolean;
}

/**
 * The confirm/cancel pattern for destructive or irreversible actions, built on
 * {@link Modal}. Pass `danger` to render the confirm button in the danger tone.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      disableBackdropClose={busy}
      hideClose={busy}
      footer={
        <>
          <Btn v="outline" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Btn>
          <Btn v={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Btn>
        </>
      }
    >
      {message && <p className="text-sm text-ink-600 dark:text-ink-300">{message}</p>}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Drawer — side sheet                                                         */
/* -------------------------------------------------------------------------- */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Accessible label when `hideHeader` is set (no visible title to wire up). */
  label?: string;
  side?: DrawerSide;
  /** Hide the built-in header (title + close) to fully control the layout. */
  hideHeader?: boolean;
  /** A thin accent bar colour rendered at the top edge (e.g. a class colour). */
  accent?: string;
  disableBackdropClose?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

let drawerSeq = 0;

/**
 * A side sheet for detail panes. Slides in from the `side` edge (default right),
 * scrolls its own body, and pins an optional `footer` to the bottom.
 */
export function Drawer({
  open,
  onClose,
  title,
  label,
  side = 'right',
  hideHeader = false,
  accent,
  disableBackdropClose = false,
  footer,
  children,
  className = '',
}: DrawerProps) {
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    drawerSeq += 1;
    idRef.current = `fit-drawer-${drawerSeq}`;
  }
  const titleId = title ? `${idRef.current}-title` : undefined;

  const close = useCallback(() => onClose(), [onClose]);

  return (
    <Overlay
      open={open}
      onClose={close}
      label={title ? undefined : (label ?? 'Panel')}
      labelledBy={titleId}
      disableBackdropClose={disableBackdropClose}
    >
      <aside className={drawerPanelClasses(side, className)}>
        {accent && (
          <span aria-hidden className="h-1 shrink-0" style={{ backgroundColor: accent }} />
        )}

        {!hideHeader && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            {title ? (
              <h2
                id={titleId}
                className="font-display text-xl font-extrabold tracking-tight text-ink-900 dark:text-white"
              >
                {title}
              </h2>
            ) : (
              <span />
            )}
            <Btn v="ghost" size="icon" icon="x" aria-label="Close" onClick={close} />
          </div>
        )}

        <div className="flex flex-1 flex-col gap-5 p-6">{children}</div>

        {footer && (
          <div className="mt-auto border-t border-ink-200 p-6 dark:border-white/10">{footer}</div>
        )}
      </aside>
    </Overlay>
  );
}
