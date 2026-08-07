'use client';

// Shared helpers + the empty-state primitive used by several control-room cards.

import { createElement, type ReactNode } from 'react';
import type { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { createDateTimeFormat } from '@fit/i18n';

/** Translator for the `admin.dashboard` namespace (from `useTranslations`). */
export type T = ReturnType<typeof useTranslations>;

const styles = stylex.create({
  empty: {
    display: 'grid',
    flex: 1,
    minHeight: '6rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-inner)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: 'var(--color-border)',
    paddingInline: '1rem',
    paddingBlock: '1.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

// This file is `.ts` (not `.tsx`), so `EmptyState` is built with `createElement`
// rather than JSX — same output, no JSX syntax required.
export function EmptyState({ children }: { children: ReactNode }) {
  return createElement('div', stylex.props(styles.empty), children);
}

export function formatTime(locale: string, iso: string): string {
  return createDateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

/** Locale-formatted short date for the recent-members "expires" line. */
export function formatDate(locale: string, iso: string): string {
  return createDateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/** Map a `GymMemberStatus` string to an Astryx Badge variant. */
export function memberStatusVariant(status: string): 'success' | 'error' | 'neutral' {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'SUSPENDED':
      return 'error';
    default:
      return 'neutral';
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export function timeAgo(t: T, iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return t('relative.justNow');
  if (mins < 60) return t('relative.minutes', { mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('relative.hours', { hours });
  return t('relative.days', { days: Math.round(hours / 24) });
}
