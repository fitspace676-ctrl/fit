'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId, useState } from 'react';

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
  revealLabels,
  ...props
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  /** Show/hide strings — turns a `type="password"` field into a revealable one. */
  revealLabels?: { show: string; hide: string };
} & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  const revealable = Boolean(revealLabels) && props.type === 'password';
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
          type={revealable && revealed ? 'text' : props.type}
        />
        {revealable && revealLabels ? (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? revealLabels.hide : revealLabels.show}
            aria-pressed={revealed}
            title={revealed ? revealLabels.hide : revealLabels.show}
            disabled={props.disabled}
            className="grid w-10 shrink-0 place-items-center text-slate-400 transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:text-slate-700 focus-visible:text-slate-700 focus-visible:outline-none active:scale-90 disabled:opacity-60"
          >
            <RevealEye revealed={revealed} />
          </button>
        ) : null}
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

/**
 * The reveal glyph: the eye draws a slash across itself while the password is
 * shown and wipes it away again, the pupil narrowing with it. Mirrors
 * `@fit/ui-kit`'s `RevealEye` (this app is Tailwind, not StyleX).
 */
function RevealEye({ revealed }: { revealed: boolean }) {
  const motion = 'duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none';
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-[1.125rem] w-[1.125rem] overflow-visible"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle
        cx="12"
        cy="12"
        r="3"
        className={`origin-center transition-transform [transform-box:fill-box] ${motion} ${revealed ? 'scale-[0.6]' : 'scale-100'}`}
      />
      <path
        d="M3.5 3.5 20.5 20.5"
        pathLength={1}
        strokeDasharray={1}
        style={{ strokeDashoffset: revealed ? 0 : 1 }}
        className={`transition-[stroke-dashoffset] ${motion}`}
      />
    </svg>
  );
}
