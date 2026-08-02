'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import type { ClassTemplateStatus } from '@fit/types';
import { Btn, Icon } from '@/components/ui';
import { deleteClassTemplateAction, setClassTemplateActiveAction } from '../actions';

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
  confirmHint: {
    margin: 0,
    maxWidth: '26rem',
    textAlign: 'right',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
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
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
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
  // Deleting is irreversible for the rule itself, so it takes two clicks.
  const [confirming, setConfirming] = useState(false);

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

  function remove(): void {
    setError(null);
    startTransition(async () => {
      const result = await deleteClassTemplateAction(templateId);
      if (result.ok) {
        // The template is gone, so its own page would 404 — go back to the roster.
        router.push('/classes');
        router.refresh();
      } else {
        setConfirming(false);
        setError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.row)}>
        <Link href={`/classes/${templateId}/edit`} {...stylex.props(styles.editLink)}>
          <Icon name="settings" sw={2} {...stylex.props(styles.editIcon)} />
          Edit
        </Link>
        <Btn v="outline" size="sm" onClick={toggle} disabled={pending}>
          {pending ? 'Saving…' : isPaused ? 'Resume' : 'Pause'}
        </Btn>
        {confirming ? (
          <>
            <Btn v="danger" size="sm" icon="trash" onClick={remove} disabled={pending}>
              {pending ? 'Deleting…' : 'Delete for good'}
            </Btn>
            <Btn v="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
              Keep
            </Btn>
          </>
        ) : (
          <Btn v="outline" size="sm" icon="trash" onClick={() => setConfirming(true)}>
            Delete
          </Btn>
        )}
      </div>
      {confirming ? (
        <p {...stylex.props(styles.confirmHint)}>
          Deleting stops this class running. Sessions that already happened, and upcoming ones a
          member has booked, are kept on the calendar.
        </p>
      ) : null}
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
