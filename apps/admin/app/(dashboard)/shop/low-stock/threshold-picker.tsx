'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { MAX_LOW_STOCK_THRESHOLD } from '@fit/types';
import { Icon } from '@/components/ui';

/**
 * The reorder cushions offered as one-tap presets. They climb roughly
 * exponentially rather than in even steps: the useful question moves from "what
 * is nearly out" (3–10, a single shelf) to "what should I reorder this month"
 * (30–50, a whole case), and even steps would spend most of the row on the
 * gap nobody looks at.
 */
const THRESHOLD_PRESETS = [3, 5, 10, 20, 30, 50] as const;

/**
 * The presets as a lookup set. It exists instead of a `.some()` over the array
 * because StyleX's compiler statically folds calls made on module constants and
 * only implements a handful of array methods — `.some()`, `.includes()` and
 * `.indexOf()` all fail the build here.
 */
const PRESET_SET: ReadonlySet<number> = new Set(THRESHOLD_PRESETS);

const styles = stylex.create({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: {
    marginRight: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  pill: {
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
  },
  pillActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  /** The custom pill open for editing: the same shape, holding a field. */
  customForm: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.625rem',
    paddingBlock: '0.125rem',
  },
  customPrefix: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  customInput: {
    width: '3.25rem',
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingBlock: '0.125rem',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
    outlineStyle: 'none',
    // Chrome's spinners crowd a field this narrow; the arrows are already a
    // keyboard away and the value is typed, not nudged.
    '::-webkit-inner-spin-button': { appearance: 'none', margin: 0 },
    '::-webkit-outer-spin-button': { appearance: 'none', margin: 0 },
  },
  customApply: {
    display: 'grid',
    height: '1.25rem',
    width: '1.25rem',
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--radius-full)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-accent-muted)',
      ':disabled': 'transparent',
    },
    color: 'var(--color-text-accent)',
    cursor: 'pointer',
    opacity: {
      default: 1,
      ':disabled': 0.35,
    },
  },
  customApplyIcon: {
    width: '0.875rem',
    height: '0.875rem',
  },
});

/**
 * The threshold selector above the low-stock report: the per-line default, one-tap
 * override presets, and a custom cushion.
 *
 * The presets stay real links, so they prefetch, survive a middle-click and read
 * as navigation — which is what they are; only the custom field needs a client.
 * A threshold that is not a preset (arrived at by typing, or by editing the URL)
 * renders as the custom pill, already active and holding its value, so the row
 * always shows the number the report was actually built with.
 *
 * **`null` is the leading option, not a missing value.** Since Stage 4 each
 * position carries its own cushion (branch → product → gym default), and that is
 * what the alert list actually wants; a preset here is an explicit "ignore all of
 * that, show me everything at or below N". The first pill therefore names the
 * default rather than leaving it as the gap before the numbers.
 *
 * Every href is built from the CURRENT search params, so choosing a cushion cannot
 * drop an explicit `?locationId=` the reader arrived with — the presets used to be
 * absolute paths, which silently reset any other param on the page.
 */
export function ThresholdPicker({ threshold }: { threshold: number | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPreset = threshold !== null && PRESET_SET.has(threshold);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(threshold === null ? '' : String(threshold));
  const inputRef = useRef<HTMLInputElement>(null);

  /** The URL for a cushion — `null` (each line's own) is the bare page. */
  function hrefFor(value: number | null): string {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) {
      params.delete('threshold');
    } else {
      params.set('threshold', String(value));
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // The URL is the source of truth for what the report shows, so a navigation —
  // a preset, the back button — discards whatever was half-typed here.
  useEffect(() => {
    setDraft(threshold === null ? '' : String(threshold));
    setEditing(false);
  }, [threshold]);

  const parsed = Number(draft);
  const valid =
    draft.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= MAX_LOW_STOCK_THRESHOLD;

  function apply(event: React.FormEvent): void {
    event.preventDefault();
    if (!valid) return;
    setEditing(false);
    router.push(hrefFor(parsed));
  }

  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.label)}>Threshold</span>

      <Link
        href={hrefFor(null)}
        aria-current={threshold === null ? 'page' : undefined}
        {...stylex.props(styles.pill, threshold === null && styles.pillActive)}
      >
        Each line’s own
      </Link>

      {THRESHOLD_PRESETS.map((preset) => (
        <Link
          key={preset}
          href={hrefFor(preset)}
          aria-current={preset === threshold ? 'page' : undefined}
          {...stylex.props(styles.pill, preset === threshold && styles.pillActive)}
        >
          ≤ {preset}
        </Link>
      ))}

      {editing ? (
        <form onSubmit={apply} {...stylex.props(styles.customForm)}>
          <span aria-hidden {...stylex.props(styles.customPrefix)}>
            ≤
          </span>
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={MAX_LOW_STOCK_THRESHOLD}
            step={1}
            inputMode="numeric"
            autoFocus
            aria-label="Custom threshold"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
            {...stylex.props(styles.customInput)}
          />
          <button
            type="submit"
            disabled={!valid}
            aria-label="Apply threshold"
            {...stylex.props(styles.customApply)}
          >
            <Icon name="check" sw={2.5} {...stylex.props(styles.customApplyIcon)} />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-current={isPreset || threshold === null ? undefined : 'page'}
          {...stylex.props(styles.pill, !isPreset && threshold !== null && styles.pillActive)}
        >
          {isPreset || threshold === null ? 'Custom…' : `≤ ${threshold}`}
        </button>
      )}
    </div>
  );
}
