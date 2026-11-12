'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useRouter } from 'next/navigation';
import { Banner, Button, ConfirmDialog, Dialog } from '@fit/ui-kit';
import type { AdminGymRequest } from '@fit/types';
import { approveGymRequestAction, rejectGymRequestAction } from '../../actions';

const styles = stylex.create({ danger: { color: 'var(--color-text-red)' } });

export function RequestActions({ request, host }: { request: AdminGymRequest; host: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await approveGymRequestAction(request.id);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.push(`/gyms/${result.data.gymId}`);
      } catch {
        setError('Could not approve this request. Please try again.');
      } finally {
        setDialog(null);
      }
    });
  }
  function reject() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await rejectGymRequestAction(request.id, reason.trim() || undefined);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setDialog(null);
        router.refresh();
      } catch {
        setError('Could not reject this request. Please try again.');
      }
    });
  }
  return (
    <div className="ops-request-stack">
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="ops-request-row">
        {request.status === 'SUBMITTED' ? (
          <Button
            label="Approve"
            variant="primary"
            disabled={pending}
            onClick={() => {
              setError(null);
              setDialog('approve');
            }}
          />
        ) : null}
        <Button
          label="Reject"
          variant="ghost"
          xstyle={styles.danger}
          disabled={pending}
          onClick={() => {
            setError(null);
            setDialog('reject');
          }}
        />
      </div>
      <ConfirmDialog
        open={dialog === 'approve'}
        onClose={() => {
          if (!pending) setDialog(null);
        }}
        title={`Approve ${request.gymName}?`}
        description={`Creates the gym ${request.gymName} at ${host} and the owner's sign-in for ${request.ownerEmail}. The owner will be emailed that the gym is ready.`}
        confirmLabel="Approve"
        cancelLabel="Cancel"
        loading={pending}
        onConfirm={approve}
      />
      <Dialog
        dismissible={!pending}
        open={dialog === 'reject'}
        onClose={() => {
          if (!pending) setDialog(null);
        }}
        title={`Reject ${request.gymName}?`}
        description="The owner will not receive an email. This request will be closed."
      >
        <form
          className="ops-request-stack"
          onSubmit={(event) => {
            event.preventDefault();
            reject();
          }}
        >
          {error ? <Banner tone="error">{error}</Banner> : null}
          <label className="ops-request-cell" htmlFor="rejection-reason">
            Reason (optional)
            <textarea
              id="rejection-reason"
              className="ops-request-textarea"
              rows={4}
              maxLength={500}
              value={reason}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="ops-request-row">
            <Button
              label="Cancel"
              variant="ghost"
              disabled={pending}
              onClick={() => setDialog(null)}
            />
            <Button label="Reject request" variant="destructive" type="submit" loading={pending} />
          </div>
        </form>
      </Dialog>
    </div>
  );
}
