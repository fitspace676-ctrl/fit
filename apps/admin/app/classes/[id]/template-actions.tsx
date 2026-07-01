'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ClassTemplateStatus } from '@fit/types';
import { Btn, buttonClasses, Card, Icon } from '@/components/ui';
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
          className={buttonClasses('outline', 'sm')}
        >
          <Icon name="settings" className="h-4 w-4" sw={2} />
          Edit
        </Link>
        <Btn v="outline" size="sm" onClick={toggle} disabled={pending}>
          {pending ? 'Saving…' : isPaused ? 'Resume' : 'Pause'}
        </Btn>
      </div>
      {error ? (
        <Card className="flex items-start gap-2 border-danger-200 bg-danger-50 px-3 py-1.5 dark:border-danger-500/20 dark:bg-danger-500/10">
          <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-danger-600 dark:text-danger-300" />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {error}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
