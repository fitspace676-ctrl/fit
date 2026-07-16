'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';

/**
 * The slide-in/out motion and open/close staging shared by the console's Astryx
 * `Dialog`-based side drawers.
 *
 * `Dialog` was built for centred modals: its entry is a 16px nudge toward the
 * viewport centre and it has no exit at all — on close it just flips to
 * `display: none` and the panel vanishes. Anchored to an edge as a drawer, that
 * reads as broken. This hook supplies what's missing:
 *
 *  • **Motion** — a real slide from the anchored edge and back out to it, matching
 *    the timing and iOS-sheet easing of the Tailwind-era drawers (`drawer-in/out-right`
 *    in `@fit/config`'s keyframes) so every side sheet in the console moves the same
 *    way while the two styling systems coexist.
 *  • **Staged close** — the exit plays while the dialog is still "open" (it has to
 *    be: `isOpen: false` means `display: none`), and only then does it unmount.
 *  • **Fresh content** — `contentKey` changes on each open. `Dialog` keeps children
 *    mounted while closed, so a hosted form would otherwise still hold the last
 *    draft when reopened.
 *
 * Drop the `Dialog` for a real drawer primitive and this hook goes with it.
 */

/**
 * Exit duration — must stay in step with `drawerMotion.exit`'s `animationDuration`,
 * since that timing is what keeps the panel mounted long enough to animate away.
 */
const CLOSE_MS = 260;

/**
 * Drawers are inset from the viewport edge, so translating by their own width alone
 * would leave that inset strip on screen. The extra 1rem carries them fully off.
 */
const OFFSCREEN = 'translateX(calc(100% + 1rem))';

const slideIn = stylex.keyframes({
  from: { transform: OFFSCREEN },
  to: { transform: 'translateX(0)' },
});

const slideOut = stylex.keyframes({
  from: { transform: 'translateX(0)' },
  to: { transform: OFFSCREEN },
});

/** Merged into the dialog's `xstyle` last, so these beat `Dialog`'s own animation. */
export const drawerMotion = stylex.create({
  enter: {
    animationName: {
      default: slideIn,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: '0.28s',
    animationTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)',
  },
  exit: {
    animationName: {
      default: slideOut,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationDuration: '0.26s',
    animationTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
    // Hold the off-screen frame for the rest of the mounted window, otherwise the
    // panel snaps back into place before unmounting.
    animationFillMode: 'forwards',
  },
});

export interface SlideDrawer {
  /** Pass to `Dialog`'s `isOpen`. Stays true through the exit animation. */
  isOpen: boolean;
  /** Remount key for the drawer's content, so each open starts clean. */
  contentKey: number;
  /** Append to the dialog's `xstyle` — the enter or exit motion for this frame. */
  motion: stylex.StyleXStyles;
  /** Open the drawer (resets content and cancels any in-flight close). */
  open: () => void;
  /** Close through the exit animation. Every close path routes here. */
  requestClose: () => void;
  /** For `Dialog`/`DialogHeader`'s `onOpenChange` — Escape, backdrop, the X. */
  handleOpenChange: (next: boolean) => void;
}

export function useSlideDrawer(): SlideDrawer {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const open = useCallback((): void => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setContentKey((key) => key + 1);
    setClosing(false);
    setIsOpen(true);
  }, []);

  const requestClose = useCallback((): void => {
    // Guard inside the updater so a double-fire (a rapid second click, or Escape
    // landing on top of one) can't stack a second timer.
    setClosing((alreadyClosing) => {
      if (alreadyClosing) return true;
      closeTimer.current = setTimeout(() => {
        setIsOpen(false);
        setClosing(false);
        closeTimer.current = null;
      }, CLOSE_MS);
      return true;
    });
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean): void => {
      if (next) open();
      else requestClose();
    },
    [open, requestClose],
  );

  return {
    isOpen,
    contentKey,
    motion: closing ? drawerMotion.exit : drawerMotion.enter,
    open,
    requestClose,
    handleOpenChange,
  };
}
