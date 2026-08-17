'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * The keyboard and focus behaviour every overlay in the portal shares.
 *
 * This is the part of a dialog that is not visual and is easy to get subtly
 * wrong, so it is written once and the popover, the dialog and the drawer all
 * mount it. What it guarantees, in order of how often it is missed:
 *
 *   1. FOCUS GOES IN. On open, focus moves into the overlay — otherwise a
 *      keyboard user's next Tab continues from wherever they were on the page
 *      BEHIND the thing that just appeared.
 *   2. FOCUS STAYS IN (when `trap`). Tab off the last focusable element wraps to
 *      the first, Shift+Tab off the first wraps to the last.
 *   3. FOCUS COMES BACK. On close, focus returns to the element that opened the
 *      overlay, so the reader is not dropped at the top of the document.
 *   4. ESCAPE CLOSES. Always, and it stops the event so a nested overlay closes
 *      one layer at a time rather than all of them at once.
 *   5. A CLICK OUTSIDE CLOSES. On `pointerdown` rather than `click`: a `click`
 *      only fires if the press AND release land on the same element, so a drag
 *      that starts inside the overlay and releases outside would otherwise not
 *      dismiss — and, worse, a press outside that releases inside would.
 *
 * The previous implementation of all three was Astryx's, which carried this for
 * free. Rebuilding them means rebuilding this too — a hand-authored overlay
 * without it looks identical and is unusable without a mouse.
 */

/** Everything the browser will let you Tab to, minus the things it will not. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // `offsetParent` is null for anything `display:none`; the rect check catches
    // `visibility:hidden` and zero-size elements, which are focusable in theory
    // and a dead end in practice.
    (el) => el.offsetParent !== null || el.getBoundingClientRect().height > 0,
  );
}

export interface DismissableOptions {
  open: boolean;
  onClose: () => void;
  /**
   * The dismiss boundary: a pointer press outside this element closes. For a
   * dialog it is the panel; for a popover it must be the wrapper that holds BOTH
   * the trigger and the panel, or a second press on the trigger counts as
   * "outside", closing the popover a moment before the trigger's own handler
   * reopens it — which reads as the popover refusing to close.
   */
  ref: RefObject<HTMLElement | null>;
  /**
   * Where focus goes on open, and what Tab is trapped within. Defaults to `ref`.
   * The popover passes its PANEL here while `ref` stays the wrapper, so opening
   * moves focus into the panel's content rather than back onto the trigger that
   * was just pressed.
   */
  focusRef?: RefObject<HTMLElement | null>;
  /**
   * Keep Tab inside the overlay. True for a dialog or a drawer, which are modal;
   * false for a popover, which is not — Tabbing out of a popover and on into the
   * page is the expected behaviour there, and it closes on the way out.
   */
  trap?: boolean;
  /**
   * Prevent the page behind from scrolling. Modal surfaces only: a popover that
   * froze the page would be a bug, not a nicety.
   */
  lockScroll?: boolean;
  /**
   * The element to return focus to on close. Defaults to whatever was focused
   * when the overlay opened, which is almost always the trigger.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /**
   * Whether Escape and an outside click may close it. Set false while a write is
   * in flight: a stray click on the scrim must not dismiss a form that is
   * halfway through saving, leaving the reader unsure whether it went through.
   * The overlay's own explicit controls still call `onClose`.
   *
   * @default true
   */
  dismissible?: boolean;
}

export function useDismissable({
  open,
  onClose,
  ref,
  focusRef,
  trap = false,
  lockScroll = false,
  returnFocusTo,
  dismissible = true,
}: DismissableOptions): void {
  const focusTarget = focusRef ?? ref;
  // Held in a ref so the cleanup that restores focus reads the element captured
  // at OPEN time, not whatever is focused at the moment of teardown — which, by
  // then, is usually something inside the overlay being unmounted.
  const restoreTo = useRef<HTMLElement | null>(null);
  // `onClose` changes identity on most renders (inline arrow at the call site).
  // Reading it through a ref keeps the listener effect from re-subscribing on
  // every render, which would otherwise tear down and rebuild the key handler
  // between a keydown and its own handling.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* --------------------------- focus in / out --------------------------- */
  useEffect(() => {
    if (!open) return;

    const root = focusTarget.current;
    restoreTo.current = (document.activeElement as HTMLElement | null) ?? null;

    if (root) {
      // Prefer the first real control; fall back to the container itself, which
      // needs a `tabIndex={-1}` from the caller to accept focus.
      const first = focusableWithin(root)[0];
      (first ?? root).focus({ preventScroll: true });
    }

    return () => {
      const target = returnFocusTo?.current ?? restoreTo.current;
      // `isConnected` guards the case where the trigger itself was removed while
      // the overlay was open — focusing a detached node silently sends focus to
      // `<body>`, and the reader loses their place with no way to tell why.
      if (target?.isConnected) {
        target.focus({ preventScroll: true });
      }
    };
  }, [open, focusTarget, returnFocusTo]);

  /* ------------------------------ scroll lock ---------------------------- */
  useEffect(() => {
    if (!open || !lockScroll) return;

    const { body } = document;
    const previous = body.style.overflow;
    // Replace the scrollbar's width with padding, or the page visibly jumps
    // sideways as the bar disappears.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const previousPad = body.style.paddingInlineEnd;

    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingInlineEnd = `${gap}px`;

    return () => {
      body.style.overflow = previous;
      body.style.paddingInlineEnd = previousPad;
    };
  }, [open, lockScroll]);

  /* --------------------------- keyboard + pointer ------------------------ */
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Stop the event either way: a non-dismissible overlay still SWALLOWS
        // Escape rather than letting it reach whatever is behind it.
        event.stopPropagation();
        event.preventDefault();
        if (dismissible) onCloseRef.current();
        return;
      }

      if (!trap || event.key !== 'Tab') return;

      const root = focusTarget.current;
      if (!root) return;

      const items = focusableWithin(root);
      if (items.length === 0) {
        // Nothing to land on — keep focus on the container rather than letting
        // Tab escape to the page behind.
        event.preventDefault();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!dismissible) return;
      const root = ref.current;
      if (root && !root.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, trap, ref, focusTarget, dismissible]);
}
