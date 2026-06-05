'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

/**
 * Form primitives for the owner-signup form. Kept small and styling-only so the
 * form owns its own state and submit logic while staying visually consistent
 * with the rest of the platform surface (and with `apps/web`'s auth forms).
 */

/** A labelled text input with an optional hint line and an optional prefix/suffix adornment. */
export function TextField({
  label,
  hint,
  prefix,
  suffix,
  ...props
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5 text-left">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="flex items-stretch overflow-hidden rounded-card border border-slate-200 bg-white transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        {prefix ? (
          <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm text-slate-400">
            {prefix}
          </span>
        ) : null}
        <input
          id={id}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
          {...props}
        />
        {suffix ? (
          <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm text-slate-400">
            {suffix}
          </span>
        ) : null}
      </div>
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
