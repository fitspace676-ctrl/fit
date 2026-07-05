'use client';

// @fit/ui-web — toast system (T1.6).
//
// A lightweight, dependency-free toast, consolidated out of the per-app copies
// (admin + member portal each shipped an identical one) into the shared design
// system. `ToastProvider` renders the fixed stack (above the mobile tab bar) and
// `useToast()` hands any client component a `toast(message, opts?)` function.
// Toasts auto-dismiss after ~2.6s.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './icon';
import type { Tone } from './badge';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
  icon: IconName;
}

export interface ToastContextValue {
  toast: (message: string, opts?: { tone?: Tone; icon?: IconName }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<Tone, string> = {
  ink: 'text-ink-900 dark:text-white',
  brand: 'text-brand-700 dark:text-brand-200',
  success: 'text-success-700 dark:text-success-200',
  warning: 'text-warning-800 dark:text-warning-200',
  danger: 'text-danger-700 dark:text-danger-200',
  accent: 'text-accent-700 dark:text-accent-200',
  iris: 'text-iris-700 dark:text-iris-200',
  flame: 'text-flame-700 dark:text-flame-200',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback<ToastContextValue['toast']>((message, opts) => {
    counter.current += 1;
    const id = counter.current;
    const item: ToastItem = {
      id,
      message,
      tone: opts?.tone ?? 'success',
      icon: opts?.icon ?? 'check',
    };
    setItems((prev) => [...prev, item]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        A polite live region so screen readers announce each toast as it is
        added, without stealing focus. `aria-atomic="false"` keeps announcements
        scoped to the newly inserted toast rather than re-reading the whole stack.
      */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto inline-flex items-center gap-2.5 rounded-pill border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold shadow-[0_20px_50px_-16px_rgba(0,0,0,0.4)] dark:border-white/10 dark:bg-ink-900"
          >
            <Icon name={t.icon} className={`h-4 w-4 ${TONE_CLASSES[t.tone]}`} sw={2.4} />
            <span className="text-ink-900 dark:text-white">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Access the toast trigger. Throws outside a {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
