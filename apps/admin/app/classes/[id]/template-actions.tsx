'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClassTemplateStatus } from '@fit/types';
import { setClassTemplateActiveAction } from '../actions';

/**
 * The class-template detail page's write controls (T5.2), shown only to
 * `ClassWrite` staff (the server component gates rendering). An "Edit" link plus a
 * pause / resume toggle: a paused template can be resumed, an active one paused.
 * The lifecycle call goes through {@link setClassTemplateActiveAction}; on success
 * the router refreshes so the header pill reflects the new status, and any error
 * surfaces inline.
 */
export function TemplateActions({
  templateId,
  status,
}: {
  templateId: string;
  status: ClassTemplateStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPaused = status === 'PAUSED';

  function toggle(): void {
    setError(null);
    startTransition(async () => {
      const result = await setClassTemplateActiveAction(templateId, isPaused);
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
          href={`/classes/${templateId}/edit`}
          className="rounded-card border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className={
            isPaused
              ? 'rounded-card border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50'
              : 'rounded-card border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50'
          }
        >
          {pending ? 'Saving…' : isPaused ? 'Resume' : 'Pause'}
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
