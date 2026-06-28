'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { I, Icon } from './marketing-ui';

/* ────────────────────────────────────────────────────────────────────────
   Header search  ·  "Aurora Glass"
   A search icon in the nav that expands into a glass field with a brand
   "halo" glow (a radial highlight that tracks the pointer and blooms on
   focus — the violet→pink of the primary CTA). Everything is painted with
   the semantic theme tokens (surface / fg / faint / overlay), so it reads
   correctly in both light and dark with no per-theme branches.
   ──────────────────────────────────────────────────────────────────────── */

/** Move the `--mx` / `--my` CSS vars to the pointer so the halo follows it. */
const trackPointer = (e: ReactMouseEvent<HTMLElement>): void => {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
};

export const HeaderSearch = ({ className = '' }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the field as it opens; close on Escape or an outside click.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    // Wire up to real search routing here; for now just collapse the field.
    if (value.trim()) setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Search"
        aria-expanded={open}
        className={`w-10 h-10 grid place-items-center rounded-btn transition ${
          open ? 'text-fg bg-overlay/[0.07]' : 'text-strong hover:text-fg hover:bg-overlay/5'
        }`}
      >
        <Icon d={open ? I.x : I.search} c="w-5 h-5" />
      </button>

      {open && (
        <div
          className="search-drop absolute right-0 top-full mt-3 z-50 w-[min(460px,calc(100vw-2rem))]"
          style={{ animation: 'search-drop 180ms cubic-bezier(0.16,1,0.3,1)' }}
        >
          <div className="rounded-2xl border border-overlay/10 bg-surface/90 p-2.5 shadow-[0_24px_60px_-20px_rgba(8,9,16,0.55)] backdrop-blur-xl backdrop-saturate-150">
            <form onSubmit={submit} onMouseMove={trackPointer} className="group relative">
              {/* Outer bloom — soft brand glow that wakes up on focus. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-1.5 rounded-[22px] opacity-0 blur-lg transition-opacity duration-300 group-focus-within:opacity-100"
                style={{
                  background:
                    'radial-gradient(220px circle at var(--mx,50%) var(--my,50%), rgba(124,58,237,0.45), rgba(236,72,153,0.32) 45%, transparent 72%)',
                }}
              />
              {/* Gradient ring — 1px halo border revealed by the surface inset. */}
              <div className="relative rounded-[15px] p-px">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-[15px] opacity-50 transition-opacity duration-300 group-hover:opacity-90 group-focus-within:opacity-100"
                  style={{
                    background:
                      'radial-gradient(180px circle at var(--mx,50%) var(--my,50%), rgba(124,58,237,0.9), rgba(236,72,153,0.7) 42%, rgb(var(--overlay) / 0.14) 76%)',
                  }}
                />
                <div className="relative flex h-12 items-center gap-2.5 rounded-[14px] bg-surface px-3.5">
                  <Icon d={I.search} c="w-[18px] h-[18px] text-faint shrink-0" />
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Search modules, members…"
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-faint outline-none"
                  />
                  <kbd className="hidden sm:inline-flex items-center rounded-md border border-overlay/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
                    Esc
                  </kbd>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
