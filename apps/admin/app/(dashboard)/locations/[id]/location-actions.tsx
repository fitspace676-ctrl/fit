'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { LocationStatus } from '@fit/types';
import { Button } from '@fit/ui-kit';
import { setLocationActiveAction } from '../actions';

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
    justifyContent: 'center',
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  error: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.375rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/**
 * The location detail page's write controls (T4.5), shown only to `LocationWrite`
 * staff (the server component gates rendering). An "Edit" link plus a deactivate /
 * reactivate toggle: an inactive location can be reactivated, an active one
 * deactivated. The lifecycle call goes through {@link setLocationActiveAction}; on
 * success the router refreshes so the header pill reflects the new status, and any
 * error surfaces inline.
 */
export function LocationActions({
  locationId,
  status,
  canWrite,
  canManage,
}: {
  locationId: string;
  status: LocationStatus;
  /** `LocationWrite` — the edit link. */
  canWrite: boolean;
  /** `LocationManage` — the activate / deactivate button. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isInactive = status === 'INACTIVE';

  function toggle(): void {
    setError(null);
    startTransition(async () => {
      const result = await setLocationActiveAction(locationId, isInactive);
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
        {canWrite ? (
          <Link href={`/locations/${locationId}/edit`} {...stylex.props(styles.editLink)}>
            Edit
          </Link>
        ) : null}
        {canManage ? (
          <Button
            variant={isInactive ? 'primary' : 'secondary'}
            size="inline"
            onClick={toggle}
            disabled={pending}
            label={pending ? 'Saving…' : isInactive ? 'Reactivate' : 'Deactivate'}
          />
        ) : null}
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
