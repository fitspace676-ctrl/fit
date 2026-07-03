'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { MemberStatus } from '@fit/types';
import { Btn, buttonClasses, Card, Icon } from '@/components/ui';
import { setMemberActiveAction } from '../actions';

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
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Link href={`/members/${memberId}/edit`} className={buttonClasses('outline', 'sm')}>
          <Icon name="settings" className="h-4 w-4" sw={2} />
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
        <Card className="flex items-start gap-2 bg-danger-50 px-3 py-1.5 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-4 w-4 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {error}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
