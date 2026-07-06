'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { MemberStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';
import { setMemberActiveAction } from '../actions';

const styles = stylex.create({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  editLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  editIcon: {
    width: '1rem',
    height: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    marginTop: '0.125rem',
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/**
 * The member detail page's write controls (T4.3), shown only to `MemberWrite`
 * staff (the server component gates rendering). An "Edit" link to the edit form
 * plus a deactivate / reactivate toggle: a suspended member can be reactivated,
 * any other status can be deactivated. The lifecycle call goes through
 * {@link setMemberActiveAction}; on success the router refreshes so the header
 * pill reflects the new status, and any error surfaces inline.
 */
export function MemberActions({ memberId, status }: { memberId: string; status: MemberStatus }) {
  const t = useTranslations('admin.members');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSuspended = status === 'SUSPENDED';

  function toggle(): void {
    setError(null);
    startTransition(async () => {
      const result = await setMemberActiveAction(memberId, isSuspended);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.row)}>
        <Link href={`/members/${memberId}/edit`} {...stylex.props(styles.editLink)}>
          <Icon name="settings" sw={2} {...stylex.props(styles.editIcon)} />
          {t('actions.edit')}
        </Link>
        <Btn v={isSuspended ? 'primary' : 'outline'} size="sm" onClick={toggle} disabled={pending}>
          {pending
            ? t('form.saving')
            : isSuspended
              ? t('actions.reactivate')
              : t('actions.deactivate')}
        </Btn>
      </div>
      {error ? (
        <Card variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <p role="alert" {...stylex.props(styles.errorText)}>
            {error}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
