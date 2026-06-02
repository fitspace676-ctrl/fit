'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

/**
 * Form primitives shared by the credential auth forms (login, register,
 * forgot-password). Kept deliberately small and styling-only so each form owns
 * its own state and submit logic while staying visually consistent.
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
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className="rounded-card border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
        {...props}
      />
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
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
    <button
      type="submit"
      disabled={pending}
      className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Inline error banner — `null` when there is nothing to show. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-600">
      {message}
    </p>
  );
}

/** Inline success banner — `null` when there is nothing to show. */
export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-card bg-green-50 px-3 py-2 text-sm text-green-700">
      {message}
    </p>
  );
}
