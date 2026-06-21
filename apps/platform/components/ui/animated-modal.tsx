'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Animated modal — a blurred backdrop and a panel that scales + fades in, in
 * the spirit of the Inspira UI AnimatedModal (adapted to React). Controlled via
 * `open` / `onClose`. Closes on backdrop click and Escape, locks body scroll,
 * and renders through a portal so it escapes any transformed ancestor.
 */
export interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Max width utility for the panel (default `max-w-lg`). */
  maxWidth?: string;
  lockScroll?: boolean;
}

export const AnimatedModal = ({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
  lockScroll = true,
}: AnimatedModalProps) => {
  const [mounted, setMounted] = useState(false); // present in the DOM
  const [shown, setShown] = useState(false); // animation toggle

  // Mount on open; play exit animation before unmounting on close.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF: let the browser paint the closed state (opacity-0 / scale-95)
      // once before flipping to shown, otherwise the transition is skipped.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), 500);
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape to close + body scroll lock while mounted.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, lockScroll, onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ perspective: '1200px' }}
    >
      <div
        aria-hidden
        onClick={onClose}
        className={`absolute inset-0 bg-ink-950/60 backdrop-blur-sm transition-opacity duration-300 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 w-full ${maxWidth} rounded-2xl border border-overlay/10 bg-surface p-6 shadow-[0_30px_80px_-20px_rgba(8,9,16,0.6)] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] [transform-style:preserve-3d]`}
        style={{
          opacity: shown ? 1 : 0,
          transform: shown
            ? 'rotateX(0deg) scale(1) translateY(0)'
            : 'rotateX(40deg) scale(0.9) translateY(40px)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-btn text-faint transition hover:bg-overlay/10 hover:text-fg"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        {title && <h3 className="font-display text-xl font-bold text-fg pr-8">{title}</h3>}
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
        <div className={title || description ? 'mt-5' : ''}>{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export default AnimatedModal;
