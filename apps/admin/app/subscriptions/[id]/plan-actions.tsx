'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SubscriptionPlanStatus } from '@fit/types';
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
        <Link
          href={`/subscriptions/${planId}/edit`}
          className="rounded-card border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={
            isInactive
              ? 'rounded-card border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50'
              : 'rounded-card border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50'
          }
        >
          {pending ? 'Saving…' : isInactive ? 'Reactivate' : 'Deactivate'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-1.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
