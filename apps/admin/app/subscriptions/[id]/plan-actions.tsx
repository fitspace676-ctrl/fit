'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SubscriptionPlanStatus } from '@fit/types';
import { Btn, buttonClasses } from '@/components/ui';
import { setSubscriptionPlanActiveAction } from '../actions';

/**
 * The subscription-plan detail page's write controls (T8.2), shown only to
 * `BillingManage` staff (the server component gates rendering). An "Edit" link
 * plus a deactivate / reactivate toggle: an inactive plan can be reactivated, an
 * active one deactivated. The lifecycle call goes through
 * {@link setSubscriptionPlanActiveAction}; on success the router refreshes so the
 * header pill reflects the new status, and any error surfaces inline.
 */
export function PlanActions({
  planId,
  status,
}: {
  planId: string;
  status: SubscriptionPlanStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isInactive = status === 'INACTIVE';

  function toggle(): void {
    setError(null);
    startTransition(async () => {
      const result = await setSubscriptionPlanActiveAction(planId, isInactive);
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
        <Link href={`/subscriptions/${planId}/edit`} className={buttonClasses('outline', 'sm')}>
          Edit
        </Link>
        <Btn
          v={isInactive ? 'primary' : 'outline'}
          size="sm"
          onClick={toggle}
          disabled={pending}
        >
          {pending ? 'Saving…' : isInactive ? 'Reactivate' : 'Deactivate'}
        </Btn>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger-500/30 bg-danger-500/10 px-3 py-1.5 text-sm text-danger-700 dark:text-danger-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
