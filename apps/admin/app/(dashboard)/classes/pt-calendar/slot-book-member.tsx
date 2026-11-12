'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Field } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import type { MemberSearchResult } from '../schedule/actions';
import { searchMembersForSlotAction } from './pt-session-actions';

const spin = stylex.keyframes({ to: { transform: 'rotate(360deg)' } });

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1.25rem',
  },
  title: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  hint: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
  error: { margin: 0, fontSize: '0.875rem', color: 'var(--color-error)' },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.625rem',
  },
  avatar: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    fontSize: '0.75rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  text: { display: 'flex', minWidth: 0, flex: 1, flexDirection: 'column' },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  email: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  button: {
    display: 'inline-flex',
    height: '2rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    paddingInline: '0.625rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-accent-muted)' },
    cursor: 'pointer',
    outlineStyle: 'none',
    opacity: { default: 1, ':disabled': 0.4 },
    pointerEvents: { default: 'auto', ':disabled': 'none' },
  },
  icon: { width: '0.875rem', height: '0.875rem' },
  spinner: {
    width: '0.875rem',
    height: '0.875rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRightColor: 'transparent',
    animationName: spin,
    animationDuration: '0.6s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
});

function initials(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
}

/**
 * "Book a member" on an open PT slot: search the gym's members by name or email
 * and book one onto the slot, the same way a member books it in the portal.
 */
export function SlotBookMember({
  onBook,
  bookingMemberId,
  busy,
}: {
  onBook: (memberId: string) => void;
  /** The member whose booking is in flight, if any - its row shows a spinner. */
  bookingMemberId: string | null;
  busy: boolean;
}) {
  const t = useTranslations('admin.services.sessions.book');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounced search; a stale response is dropped so results never land out of order.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    let active = true;
    const handle = setTimeout(() => {
      void searchMembersForSlotAction(trimmed).then((result) => {
        if (!active) return;
        if (result.ok) {
          setResults(result.data);
          setSearchError(null);
        } else {
          setResults([]);
          setSearchError(result.error);
        }
        setSearching(false);
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  const trimmed = query.trim();

  return (
    <div {...stylex.props(styles.section)}>
      <h3 {...stylex.props(styles.title)}>{t('title')}</h3>
      <Field
        label={t('searchLabel')}
        labelHidden
        size="chrome"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('searchPlaceholder')}
        disabled={busy}
        autoComplete="off"
      />
      {!trimmed ? (
        <p {...stylex.props(styles.hint)}>{t('hint')}</p>
      ) : searching ? (
        <p {...stylex.props(styles.hint)}>{t('searching')}</p>
      ) : searchError ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {searchError}
        </p>
      ) : results.length === 0 ? (
        <p {...stylex.props(styles.hint)}>{t('noResults', { query: trimmed })}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {results.map((member) => {
            const label = member.name?.trim() || member.email;
            return (
              <li key={member.id} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.avatar)}>{initials(label)}</span>
                <div {...stylex.props(styles.text)}>
                  <span {...stylex.props(styles.name)}>{label}</span>
                  {member.name ? <span {...stylex.props(styles.email)}>{member.email}</span> : null}
                </div>
                <button
                  type="button"
                  aria-label={t('bookMember', { member: label })}
                  title={t('bookMember', { member: label })}
                  onClick={() => onBook(member.id)}
                  disabled={busy}
                  {...stylex.props(styles.button)}
                >
                  {bookingMemberId === member.id ? (
                    <span {...stylex.props(styles.spinner)} aria-hidden />
                  ) : (
                    <Icon name="plus" sw={2.5} {...stylex.props(styles.icon)} />
                  )}
                  <span>{t('action')}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
