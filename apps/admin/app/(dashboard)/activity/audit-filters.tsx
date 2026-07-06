'use client';

// @fit/admin — the Activity area's audit tab filter bar (T3.10, was T4.9).
//
// An action select and a `from`/`to` calendar-day range, matching the activity
// feed's own filter bar. Each control writes its state to the URL search params
// (the single source of truth the server page reads), resetting to page 1 on any
// change so the pager never lands past the end of a freshly-narrowed result set,
// and preserving the `?tab=audit` param (it is not one of the keys it touches).
// Navigation runs in a transition so the controls stay responsive while the
// server re-renders.

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Btn } from '@/components/ui';
import { ACTION_OPTIONS } from './audit-actions';

const styles = stylex.create({
  row: {
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
  actionField: {
    width: {
      default: '100%',
      '@media (min-width: 640px)': '16rem',
    },
  },
  dateField: {
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

export function AuditFilters({ action, from, to }: { action: string; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const t = useTranslations('admin.activity.audit');

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

  /** Clear every filter but keep the audit tab active. */
  function clear(): void {
    startTransition(() => router.replace(`${pathname}?tab=audit`));
  }

  return (
    <div {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.actionField)}>
        <label htmlFor="audit-action" {...stylex.props(styles.label)}>
          {t('filters.action')}
        </label>
        <select
          id="audit-action"
          value={action}
          onChange={(event) => commit('action', event.target.value)}
          {...stylex.props(styles.input)}
        >
          <option value="">{t('filters.all')}</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(`actions.${option.labelKey}`)}
            </option>
          ))}
        </select>
      </div>

      <div {...stylex.props(styles.dateField)}>
        <label htmlFor="audit-from" {...stylex.props(styles.label)}>
          {t('filters.from')}
        </label>
        <input
          id="audit-from"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => commit('from', event.target.value)}
          {...stylex.props(styles.input)}
        />
      </div>

      <div {...stylex.props(styles.dateField)}>
        <label htmlFor="audit-to" {...stylex.props(styles.label)}>
          {t('filters.to')}
        </label>
        <input
          id="audit-to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => commit('to', event.target.value)}
          {...stylex.props(styles.input)}
        />
      </div>

      {action || from || to ? (
        <Btn v="outline" size="md" onClick={clear} {...stylex.props(styles.clearBtn)}>
          {t('filters.clear')}
        </Btn>
      ) : null}
    </div>
  );
}
