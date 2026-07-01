'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { Icon, buttonClasses } from '@/src/components/ui';

/**
 * Form primitives shared by the credential auth forms (login, register,
 * forgot-password). Kept deliberately small and styling-only so each form owns
 * its own state and submit logic while staying visually consistent.
 *
 * Restyled onto the formacore design system: kit input styles, the brand
 * gradient submit button (`buttonClasses`), and ink/tone tokens with dark
 * variants.
 */

/** A labelled text input with an optional hint line below it. */
export function TextField({
  label,
  hint,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-sm font-medium text-ink-700 dark:text-ink-200">
        {label}
      </label>
      <input
        id={id}
        className="h-11 rounded-field border border-ink-200 bg-white px-3.5 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        {...props}
      />
      {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

/** Primary submit button that reflects the form's pending state. */
export function SubmitButton({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: ReactNode;
}) {
  return (
    <button type="submit" disabled={pending} className={buttonClasses('primary', 'md', 'w-full')}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Inline error banner — `null` when there is nothing to show. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-field bg-danger-50 px-3 py-2 text-sm text-danger-700 ring-1 ring-inset ring-danger-500/20 dark:bg-danger-500/10 dark:text-danger-200 dark:ring-danger-400/25"
    >
      <Icon name="info" className="mt-0.5 h-4 w-4 flex-shrink-0" sw={2.2} />
      {message}
    </p>
  );
}

/** Inline success banner — `null` when there is nothing to show. */
export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-field bg-success-50 px-3 py-2 text-sm text-success-700 ring-1 ring-inset ring-success-500/20 dark:bg-success-500/10 dark:text-success-200 dark:ring-success-400/25"
    >
      <Icon name="check" className="mt-0.5 h-4 w-4 flex-shrink-0" sw={2.4} />
      {message}
    </p>
  );
}
