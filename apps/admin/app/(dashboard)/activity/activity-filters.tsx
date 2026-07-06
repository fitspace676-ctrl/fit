'use client';

// @fit/admin — the Activity screen's filter bar (T3.9).
//
// A row of kind chips (All + one per event kind) and a from/to calendar-day
// range. Each control writes its state to the URL search params — the single
// source of truth the server page reads — resetting to page 1 on any change so
// the pager never lands past the end of a freshly-narrowed result set.
// Navigation runs in a transition so the controls stay responsive while the
// server re-renders.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ACTIVITY_EVENT_TYPES, type ActivityEventType } from '@fit/types';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Btn } from '@/components/ui';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  chipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    overflowX: 'auto',
  },
  chip: {
    height: '2.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.875rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    transitionProperty: 'background-color, color, border-color',
    transitionDuration: '150ms',
  },
  chipActive: {
    backgroundColor: 'var(--color-accent-muted)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-text-accent)',
  },
  chipInactive: {
    backgroundColor: {
      default: 'var(--color-background-muted)',
      ':hover': 'var(--color-background-surface)',
    },
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-secondary)',
  },
  range: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    gap: '0.75rem',
    alignItems: {
      default: 'stretch',
      '@media (min-width: 640px)': 'flex-end',
    },
  },
  field: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '11rem',
    },
  },
  label: {
    marginBottom: '0.25rem',
    display: 'block',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  input: {
    height: '2.75rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
  },
  clearBtn: {
    alignSelf: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'auto',
    },
  },
});

export function ActivityFilters({
  type,
  from,
  to,
}: {
  type: ActivityEventType | '';
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity');

  /** Push a single param change to the URL, always resetting to page 1. */
  function commit(key: string, value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  const chips: Array<{ value: ActivityEventType | ''; label: string }> = [
    { value: '', label: t('filters.all') },
    ...ACTIVITY_EVENT_TYPES.map((kind) => ({ value: kind, label: t(`types.${kind}`) })),
  ];

  return (
    <div {...stylex.props(styles.stack)}>
      {/* Kind chips. */}
      <div {...stylex.props(styles.chipRow)}>
        {chips.map((chip) => {
          const active = type === chip.value;
          return (
            <button
              key={chip.value || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => commit('type', chip.value)}
              {...stylex.props(styles.chip, active ? styles.chipActive : styles.chipInactive)}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Date range. */}
      <div {...stylex.props(styles.range)}>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="activity-from" {...stylex.props(styles.label)}>
            {t('filters.from')}
          </label>
          <input
            id="activity-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => commit('from', event.target.value)}
            {...stylex.props(styles.input)}
          />
        </div>

        <div {...stylex.props(styles.field)}>
          <label htmlFor="activity-to" {...stylex.props(styles.label)}>
            {t('filters.to')}
          </label>
          <input
            id="activity-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => commit('to', event.target.value)}
            {...stylex.props(styles.input)}
          />
        </div>

        {type || from || to ? (
          <Btn
            v="outline"
            size="md"
            onClick={() => startTransition(() => router.replace(pathname))}
            {...stylex.props(styles.clearBtn)}
          >
            {t('filters.clear')}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}
