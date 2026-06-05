'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MemberStatus } from '@fit/types';
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
        <Link
          href={`/members/${memberId}/edit`}
          className="rounded-card border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={
            isSuspended
              ? 'rounded-card border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50'
              : 'rounded-card border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50'
          }
        >
          {pending ? 'Saving…' : isSuspended ? 'Reactivate' : 'Deactivate'}
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
