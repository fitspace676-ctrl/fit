import type { InputHTMLAttributes } from 'react';

export function SearchField({
  label,
  ...props
}: { label: string } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'className' | 'style'
>) {
  return (
    <label className="ops-search">
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input {...props} type="search" aria-label={props['aria-label'] ?? label} />
    </label>
  );
}
