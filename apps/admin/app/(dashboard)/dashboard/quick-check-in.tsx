'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Banner, Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import {
  checkInMemberAction,
  searchCheckInMembersAction,
  type CheckInCandidate,
  type CheckInOutcome,
} from './reception-actions';
import { CardTitle } from '../card-title';

/** Wait this long after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 250;

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
  },
  searchWrap: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute',
    insetInlineStart: '0.875rem',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '1.125rem',
    height: '1.125rem',
    color: 'var(--color-text-secondary)',
    pointerEvents: 'none',
  },
  input: {
    width: '100%',
    height: '2.75rem',
    paddingInlineStart: '2.5rem',
    paddingInlineEnd: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--color-background-body)',
    color: 'var(--color-text-primary)',
    fontSize: '0.9375rem',
    outline: 'none',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '0.625rem',
    borderBlockStartWidth: '1px',
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: 'var(--color-border)',
  },
  main: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  sub: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  hint: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The front desk's check-in: find the member as you type (name, email or phone)
 * and check them in at this branch in one press. The result says straight away
 * whether their membership lets them in, and the page's figures refresh.
 */
export function QuickCheckIn({ locationId }: { locationId: string | null }) {
  const t = useTranslations('admin.dashboard.reception');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CheckInCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const latest = useRef('');

  useEffect(() => {
    const trimmed = query.trim();
    latest.current = trimmed;
    if (!trimmed) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      void searchCheckInMembersAction(trimmed).then((result) => {
        if (latest.current !== trimmed) return;
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setError(result.error);
        }
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  function checkIn(member: CheckInCandidate): void {
    setBusyId(member.id);
    setError(null);
    startTransition(async () => {
      const result = await checkInMemberAction(member.id, locationId);
      setBusyId(null);
      if (result.ok) {
        setOutcome(result.data);
        setQuery('');
        setResults(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card padding="none" xstyle={styles.card}>
      <CardTitle icon="qr">{t('checkIn.title')}</CardTitle>
      <div {...stylex.props(styles.searchWrap)}>
        <Icon name="search" {...stylex.props(styles.searchIcon)} />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOutcome(null);
          }}
          placeholder={t('checkIn.placeholder')}
          aria-label={t('checkIn.placeholder')}
          autoComplete="off"
          {...stylex.props(styles.input)}
        />
      </div>

      {outcome ? (
        <Banner tone={outcome.status === 'ACTIVE' ? 'success' : 'error'}>
          {outcome.status === 'ACTIVE'
            ? t('checkIn.done', {
                name: outcome.name,
                plan: outcome.planName ?? t('checkIn.noPlan'),
              })
            : t(`checkIn.warn.${outcome.status}`, { name: outcome.name })}
        </Banner>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      {results === null ? (
        <p {...stylex.props(styles.hint)}>{t('checkIn.hint')}</p>
      ) : results.length === 0 ? (
        <p {...stylex.props(styles.hint)}>{t('checkIn.noMatch', { query: query.trim() })}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {results.map((member) => (
            <li key={member.id} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.main)}>
                <span {...stylex.props(styles.name)}>{member.name}</span>
                <span {...stylex.props(styles.sub)}>
                  {[member.phone, member.planName ?? t('checkIn.noPlan')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Button
                variant="primary"
                size="inline"
                label={busyId === member.id ? t('checkIn.saving') : t('checkIn.action')}
                loading={busyId === member.id}
                disabled={busyId !== null}
                onClick={() => checkIn(member)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
